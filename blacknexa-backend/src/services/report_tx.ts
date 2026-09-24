/**
 * Transaction plumbing shared by the report domain — lock timeouts, the two
 * Postgres errors the domain answers deliberately, and reference numbers taken
 * inside the caller's transaction.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.4 ("Lock wait → `lock_timeout` 5 s → 409 'Try
 * again' (API); never a hung connection"), §7.1 (the `source_draft_id` unique
 * violation is caught *outside* the transaction) and §7.6 (a duplicate open flag
 * is a 23505 answered with the existing flag).
 *
 * ── Why every locking domain transaction goes through `lockedTransaction` ──
 * Filing locks the draft, an edit locks the report, a flag locks its target, and
 * the moderation worker locks the same rows from the other side. Postgres waits
 * for a row lock indefinitely by default, so one slow transaction could pin a
 * request — and its pooled connection — for as long as it liked. `SET LOCAL
 * lock_timeout` bounds the wait to five seconds for this transaction only, and a
 * timeout surfaces as a 409 the client can retry instead of a 500 or a hang.
 *
 * ── Why reference numbers are taken inside the transaction ────────────────
 * `nextCaseRef()` / `nextFlagRef()` in `report.model.ts` run on their own pooled
 * connection. Called from inside a transaction callback that already holds a
 * connection, each would need a second one at the same moment — under load, with
 * every request doing the same, the pool can run dry with every holder waiting on
 * another. `nextRefInTx` asks the transaction's own connection for the next
 * value. A sequence value is never rolled back either way, so a failed filing
 * leaves the same gap it always did; what changes is that a retried or
 * deduplicated request no longer burns a number before it knows it needs one.
 */

import { QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import { HttpError } from "@/middlewares/error.middleware";

/** `lock_timeout` for domain transactions (§5.3, §5.4). */
export const DOMAIN_LOCK_TIMEOUT = "5s";

const LOCK_NOT_AVAILABLE = "55P03";
const DEADLOCK_DETECTED = "40P01";
const UNIQUE_VIOLATION = "23505";

/** The Postgres SQLSTATE behind a Sequelize error, or null. */
export function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const candidates = [
    (err as { parent?: { code?: unknown } }).parent?.code,
    (err as { original?: { code?: unknown } }).original?.code,
    (err as { code?: unknown }).code,
  ];
  const code = candidates.find((value) => typeof value === "string");
  return typeof code === "string" ? code : null;
}

/** The constraint (index) a Postgres error names, or null. */
function pgConstraint(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const candidates = [
    (err as { parent?: { constraint?: unknown } }).parent?.constraint,
    (err as { original?: { constraint?: unknown } }).original?.constraint,
    (err as { constraint?: unknown }).constraint,
  ];
  const name = candidates.find((value) => typeof value === "string");
  return typeof name === "string" ? name : null;
}

/**
 * True for a unique violation — optionally only for the named constraint, so a
 * caller that means "this draft was already filed" does not swallow a violation
 * of some other index.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const unique =
    pgErrorCode(err) === UNIQUE_VIOLATION ||
    (err instanceof Error && err.name === "SequelizeUniqueConstraintError");
  if (!unique) return false;
  return constraint === undefined || pgConstraint(err) === constraint;
}

/**
 * True when a row lock could not be taken within `lock_timeout` — or Postgres
 * broke a deadlock by aborting this transaction. Both mean "someone else held
 * what we needed"; neither left anything written, so both are safe to retry.
 */
export function isLockTimeout(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code === LOCK_NOT_AVAILABLE || code === DEADLOCK_DETECTED;
}

/** Bound this transaction's lock waits. Must be the first statement that could wait. */
export async function setLockTimeout(tx: Transaction): Promise<void> {
  await sequelize.query(`SET LOCAL lock_timeout = '${DOMAIN_LOCK_TIMEOUT}'`, { transaction: tx });
}

/**
 * Run `work` in a transaction with the domain lock timeout, mapping a lock wait
 * that timed out (or a deadlock Postgres resolved against us) to a 409.
 * Everything else propagates unchanged — including unique violations, which
 * callers catch *outside* (§7.1): once a statement has failed, Postgres refuses
 * every further statement in that transaction, so the recovery query has to run
 * after it has rolled back.
 */
export async function lockedTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await sequelize.transaction(async (tx) => {
      await setLockTimeout(tx);
      return work(tx);
    });
  } catch (err) {
    if (isLockTimeout(err)) {
      throw new HttpError("Someone else is changing this right now. Try again in a moment.", 409);
    }
    throw err;
  }
}

/** The two reference sequences and their printed prefixes (`report.model.ts`). */
const REFERENCES = {
  case: { sequence: "report_case_ref_seq", prefix: "BNX" },
  flag: { sequence: "report_flag_ref_seq", prefix: "FLG" },
} as const;

/**
 * The next `BNX-####` / `FLG-####`, on the transaction's own connection — the
 * same format as `nextCaseRef()` / `nextFlagRef()`: padded to four digits and
 * allowed to grow past them.
 */
export async function nextRefInTx(tx: Transaction, kind: keyof typeof REFERENCES): Promise<string> {
  const { sequence, prefix } = REFERENCES[kind];
  const rows = await sequelize.query<{ nextval: string | number }>(
    `SELECT nextval('${sequence}') AS nextval`,
    { type: QueryTypes.SELECT, transaction: tx },
  );
  const value = rows[0]?.nextval;
  if (value === undefined || value === null) {
    throw new Error(`nextval(${sequence}) returned no row`);
  }
  return `${prefix}-${String(value).padStart(4, "0")}`;
}
