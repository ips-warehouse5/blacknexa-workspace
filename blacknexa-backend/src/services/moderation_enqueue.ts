/**
 * Enqueue and cancel moderation runs — inside the caller's transaction.
 *
 * docs/INCIDENT_MODULE_PLAN.md §4.3, §5.1, §7.2 and D13. `moderation_runs` is
 * the queue; this file is the only place rows enter it or are withdrawn from it
 * before a worker claims them.
 *
 * ── Why every function takes the caller's transaction ─────────────────────
 * "Never lose work": a public report, an edit, a comment or a flag and the run
 * that will decide it are written in *one* transaction. If the domain write
 * commits, the run exists; if it rolls back, so does the run. There is no
 * window in which content is pending with nothing queued to decide it — the
 * failure the old `job_queue` (no transactional enqueue) could not rule out.
 * After the transaction resolves, callers ring `pokeModeration()`
 * (`moderation_signal.ts`) so a worker picks the row up at once.
 *
 * Callers apply the D3 predicate first — `needsModeration(report)` from
 * `types/moderation.interface.ts` — so a private report never gets a run.
 *
 * ── The upsert (one queued run per target) ────────────────────────────────
 * `uq_moderation_runs_queued` allows one `queued` row per (target_type,
 * target_id). A second enqueue for the same target — an edit arriving while
 * the first check is still queued — merges into that row instead of queueing a
 * duplicate AI call:
 *
 *   content_version = GREATEST(old, new)   the newest version is what gets checked
 *   trigger         = new                  …except that `resubmitted` is sticky
 *   priority        = GREATEST(old, new)   an urgent row never drops priority
 *   attempts        = 0, error = NULL      a merged row starts its retries afresh
 *   max_attempts    = LEAST(old, new)      an urgent row keeps its short budget
 *   available_at    = new                  due now
 *   case_id         = COALESCE(new, old)   a flagged run keeps its case
 *
 * Resetting `attempts` on a merge means `attempts` alone does not identify a
 * claim over a row's whole life, so the worker fences its writes on `attempts`
 * *and* `started_at`, which the claim stamps (`moderation_pipeline.service.ts`).
 *
 * `resubmitted` stays sticky because D19 promises that "a resubmission after a
 * human rejection always goes back to a human": an owner who edits twice while
 * the resubmission is still queued must not turn it into a plain `edited` run
 * that the AI alone could approve. This covers the queued row only. If the
 * resubmission run was already *claimed*, the second edit inserts a fresh row
 * with whatever trigger the caller passes, and the claimed one is discarded at
 * apply as stale — so the edit path must itself pass `resubmitted` when it
 * edits a pending report that is still awaiting its resubmission check.
 *
 * The statement is raw SQL because Sequelize cannot express `ON CONFLICT …
 * WHERE`. Bypassing the model means supplying `id`, `created_at`, `created_on`
 * and `updated_on` here; the model's `beforeValidate` hook never runs.
 */

import { QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import { nowIso } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";
import type { ModerationTargetType, RunTrigger } from "@/types/moderation.interface";

/** What to queue. Ids only — a run never carries content (D13). */
export interface EnqueueRunInput {
  targetType: ModerationTargetType;
  /** The comment id for comment runs; the report id otherwise (evidence runs too). */
  targetId: string;
  reportId: string;
  commentId?: string | null;
  /** The open case a `flagged` run re-checks. */
  caseId?: string | null;
  /** The target's `content_version` at the time of the write. */
  contentVersion: number;
  trigger: RunTrigger;
  /** `RUN_PRIORITY` from the moderation vocabulary. */
  priority: number;
  /**
   * Defaults to `MODERATION_MAX_ATTEMPTS`. Urgent filings pass
   * `maxAttemptsFor(true)` (`min(2, MODERATION_MAX_ATTEMPTS)`) so an outage
   * sends them to a human within about a minute (D5).
   */
  maxAttempts?: number;
  /** Defer the first claim, in ms. Defaults to 0 (due immediately). */
  delayMs?: number;
}

/** The attempt budget for a run: `min(2, MODERATION_MAX_ATTEMPTS)` when urgent. */
export function maxAttemptsFor(urgent: boolean): number {
  return urgent ? env.moderation.urgentMaxAttempts : env.moderation.maxAttempts;
}

/**
 * Queue a run, or merge into the target's already-queued run.
 *
 * Returns the id of the queued row — the new one, or the existing row it merged
 * into. Must be called inside the transaction that wrote the content.
 */
export async function enqueueRun(tx: Transaction, input: EnqueueRunInput): Promise<string> {
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? env.moderation.maxAttempts));
  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO moderation_runs
            (id, target_type, target_id, report_id, comment_id, case_id, content_version,
             "trigger", status, priority, attempts, max_attempts, available_at,
             created_at, created_on, updated_on)
     VALUES (:id, :targetType, :targetId, :reportId, :commentId, :caseId, :contentVersion,
             :trigger, 'queued', :priority, 0, :maxAttempts, :availableAt,
             :createdAt, now(), now())
     ON CONFLICT (target_type, target_id) WHERE status = 'queued'
     DO UPDATE SET
             content_version = GREATEST(moderation_runs.content_version, EXCLUDED.content_version),
             "trigger"       = CASE WHEN moderation_runs."trigger" = 'resubmitted'
                                    THEN moderation_runs."trigger"
                                    ELSE EXCLUDED."trigger" END,
             priority        = GREATEST(moderation_runs.priority, EXCLUDED.priority),
             attempts        = 0,
             max_attempts    = LEAST(moderation_runs.max_attempts, EXCLUDED.max_attempts),
             available_at    = EXCLUDED.available_at,
             error           = NULL,
             case_id         = COALESCE(EXCLUDED.case_id, moderation_runs.case_id),
             updated_on      = now()
     RETURNING id`,
    {
      replacements: {
        id: uuidv4(),
        targetType: input.targetType,
        targetId: input.targetId,
        reportId: input.reportId,
        commentId: input.commentId ?? null,
        caseId: input.caseId ?? null,
        contentVersion: input.contentVersion,
        trigger: input.trigger,
        priority: input.priority,
        maxAttempts,
        availableAt: Date.now() + Math.max(0, input.delayMs ?? 0),
        createdAt: nowIso(),
      },
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  const id = rows[0]?.id;
  if (!id) {
    // INSERT … ON CONFLICT DO UPDATE … RETURNING always yields the row; reaching
    // here means the statement did not run as written.
    throw new Error("moderation_runs upsert returned no row");
  }
  return id;
}

/**
 * Withdraw a target's queued run (edits superseded by deletion, removal,
 * deactivation). Returns how many rows were cancelled (0 or 1).
 *
 * A run already `running` is left alone on purpose: its apply step re-checks
 * every cancel condition under the target lock and ends as `noop` by itself,
 * and cancelling it here would race the worker's fenced writes.
 */
export async function cancelQueuedRunsForTarget(
  tx: Transaction,
  targetType: ModerationTargetType,
  targetId: string,
): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE moderation_runs
        SET status = 'cancelled', outcome = 'noop', finished_at = :now, updated_on = now()
      WHERE target_type = :targetType AND target_id = :targetId AND status = 'queued'
      RETURNING id`,
    {
      replacements: { targetType, targetId, now: nowIso() },
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  return rows.length;
}

/**
 * Withdraw every queued run for a report *and its comments* — owner delete,
 * account erasure. Comment runs carry their parent's `report_id`, so one
 * statement covers both. Returns how many rows were cancelled.
 */
export async function cancelRunsForReport(tx: Transaction, reportId: string): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE moderation_runs
        SET status = 'cancelled', outcome = 'noop', finished_at = :now, updated_on = now()
      WHERE report_id = :reportId AND status = 'queued'
      RETURNING id`,
    {
      replacements: { reportId, now: nowIso() },
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  return rows.length;
}
