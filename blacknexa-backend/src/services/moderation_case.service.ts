/**
 * Moderation cases — the human queue's items, opened, merged and resolved.
 *
 * docs/INCIDENT_MODULE_PLAN.md §4.4, §5.3 step 6, §5.4 and §7.8. A case
 * aggregates every signal about one target (AI, keyword hits, media awaiting
 * review, N user flags) so a moderator decides once with all of it in view.
 * The pipeline, the flag service, the admin decisions and the delete/deactivate
 * paths all go through this file, so the merge rules exist exactly once.
 *
 * ── Concurrency: why raw SQL ──────────────────────────────────────────────
 * Two flags can arrive in the same millisecond, or a flag can race the worker
 * holding the same target. A read-modify-write in application code would lose
 * one of them. Instead:
 *
 *   • `upsertOpenCase` is one `INSERT … ON CONFLICT (target_type, target_id)
 *     WHERE state = 'open' DO UPDATE` against `uq_moderation_cases_open`, with
 *     the counters incremented and the sets unioned *in SQL*, and booleans
 *     OR-ed — so concurrent signals all land, whichever commits first (§5.4).
 *   • `resolveCase` is one `UPDATE … WHERE id = :id AND state = 'open'
 *     RETURNING` — of two moderators deciding at once, exactly one gets the row
 *     back and the other gets `null` (→ 409) before touching anything else.
 *
 * Because these statements bypass the model, they supply `id`, `created_on` and
 * `updated_on` themselves.
 *
 * ── Lock order (read this before calling anything here) ───────────────────
 * Every transaction that touches a case must take its locks in this order:
 *
 *     1. the target row — `SELECT … FROM reports|report_comments … FOR UPDATE`
 *     2. the case row   — taken implicitly by the upsert / resolve below
 *     3. flag rows      — taken implicitly by the flag updates below
 *     4. counters       — `reports.comment_count` via `comment_state.ts`
 *
 * The worker's apply step, the flag service and every admin decision follow it,
 * so no two of them can each hold what the other is waiting for. An admin
 * decision therefore locks the target *first* and then calls `resolveCase`; the
 * loser of a double decision still gets its 409 before it has written anything,
 * it has merely waited for the target lock. Callers also set
 * `SET LOCAL lock_timeout = '5s'` (§5.3), so a wait can never hang a
 * connection.
 *
 * ── Priority ──────────────────────────────────────────────────────────────
 * Recomputed with the pure `casePriority()` after every upsert (§4.4). The only
 * input not stored on the case is "the AI found a high-severity violation": the
 * caller passes it when it has the assessment in hand (the pipeline upserts the
 * case before it writes the run result), and otherwise it is derived from the
 * case's latest run, so a later user flag does not quietly drop the +20.
 */

import { QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import { nowIso } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";
import type { ModerationCaseRow } from "@/models/moderation.model";
import { cancelQueuedRunsForTarget } from "@/services/moderation_enqueue";
import {
  HOLD_REASONS,
  casePriority,
  isPolicyCategory,
  normaliseFlagCategory,
  type CaseResolution,
  type FlagStatus,
  type HoldReason,
  type ModerationTargetType,
  type PolicyCategory,
  type SafetyRisk,
} from "@/types/moderation.interface";
import type { FlagReason } from "@/types/report.interface";

/** A signal to merge into the target's open case (or to open one with). */
export interface UpsertOpenCaseInput {
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  commentId?: string | null;
  /** The AI raised this (AI Flags tab). OR-ed into the case. */
  aiFlagged?: boolean;
  /** A keyword rule raised this (Keyword Flags tab). OR-ed. */
  keywordFlagged?: boolean;
  /** Evidence awaits a moderator (Media Review tab). OR-ed. */
  mediaReview?: boolean;
  /** Added to `user_flag_count` in SQL. */
  userFlagIncrement?: number;
  /** Unioned into `categories`, first-seen order preserved. */
  categories?: readonly PolicyCategory[];
  /** Unioned into `hold_reasons`. */
  holdReasons?: readonly HoldReason[];
  /** `none` / null leave the case's current value; anything else replaces it. */
  safetyRisk?: SafetyRisk | null;
  /** OR-ed: once urgent, a case stays urgent until resolved. */
  urgent?: boolean;
  /** Becomes `latest_run_id` when given. */
  latestRunId?: string | null;
  /**
   * The current assessment has a violated category with severity `high`. Omit
   * it when you have no assessment (flags); it is then derived from the case's
   * latest run.
   */
  highSeverityViolation?: boolean;
}

export interface ResolveCaseInput {
  resolution: CaseResolution;
  /** The deciding admin, or null for system resolutions. */
  resolvedBy: string | null;
  reasonCode?: string | null;
  /** Author-visible. */
  publicNote?: string | null;
  /** Staff-only. Kept as it was when omitted. */
  internalNote?: string | null;
}

/** What a flag resolution writes. `resolution` is the text the reporter is emailed. */
export interface FlagOutcome {
  status: Exclude<FlagStatus, "open">;
  resolution: string;
  /** The deciding admin, or null for system resolutions. */
  resolvedBy?: string | null;
}

/** A flag as it was resolved — enough to email the reporter after the commit. */
export interface ResolvedFlagRow {
  id: string;
  flag_ref: string;
  reporter_id: string | null;
  report_id: string | null;
  comment_id: string | null;
  case_id: string | null;
  reason: FlagReason;
  status: FlagStatus;
  resolution: string | null;
}

export interface CloseForTargetInput {
  targetType: ModerationTargetType;
  targetId: string;
  /** `withdrawn` for owner delete / removal / erasure; `superseded` for deactivation. */
  resolution: Extract<CaseResolution, "withdrawn" | "superseded">;
  flagOutcome: FlagOutcome;
  /** The admin responsible (deactivation), or null for owner/system closes. */
  resolvedBy?: string | null;
}

export interface CloseForTargetResult {
  /** The case that was open, now resolved; null if none was open. */
  closedCase: ModerationCaseRow | null;
  /** Every flag this call resolved. Email the reporters *after* the commit. */
  flags: ResolvedFlagRow[];
  /** Queued runs withdrawn (0 or 1). */
  runsCancelled: number;
}

const CASE_COLUMNS = "*";

function cleanCategories(values: readonly string[] | undefined): PolicyCategory[] {
  return [...new Set((values ?? []).filter(isPolicyCategory))];
}

function cleanHoldReasons(values: readonly string[] | undefined): HoldReason[] {
  const allowed = HOLD_REASONS as readonly string[];
  return [...new Set((values ?? []).filter((v): v is HoldReason => allowed.includes(v)))];
}

/**
 * The flag rows belonging to a target. A report's own flags have no
 * `comment_id` — comment flags may also carry their parent's `report_id`, and
 * must not be swept up with the report's.
 */
function flagTargetSql(targetType: ModerationTargetType): string {
  return targetType === "comment"
    ? "comment_id = :targetId"
    : "report_id = :targetId AND comment_id IS NULL";
}

/**
 * The pure half of `recountFlagSignals` (review Q2): a case's user-flag signal
 * from the reasons of the flags still open on its target. Categories are only
 * rebuilt for a case nothing but flags raised; an AI or keyword category is
 * never dropped. An unknown legacy reason counts as `other`, as the backfill
 * reads it (`summariseOpenFlags`).
 */
export function recountedFlagSignal(
  row: Pick<ModerationCaseRow, "ai_flagged" | "keyword_flagged" | "categories" | "hold_reasons">,
  openReasons: readonly (string | null)[],
): { userFlagCount: number; categories: PolicyCategory[]; holdReasons: HoldReason[] } {
  const current = cleanCategories(Array.isArray(row.categories) ? (row.categories as string[]) : []);
  const flagOnly = !row.ai_flagged && !row.keyword_flagged;
  const categories = flagOnly
    ? [...new Set(openReasons.map((reason) => normaliseFlagCategory(reason) ?? "other"))]
    : current;
  const reasons = cleanHoldReasons(Array.isArray(row.hold_reasons) ? (row.hold_reasons as string[]) : []);
  return {
    userFlagCount: openReasons.length,
    categories,
    holdReasons: openReasons.length === 0 ? reasons.filter((reason) => reason !== "user_flags") : reasons,
  };
}

class ModerationCaseService {
  /**
   * Open a case for the target, or merge this signal into its open case.
   * Returns the case as stored, priority included. Lock the target row first.
   */
  async upsertOpenCase(tx: Transaction, input: UpsertOpenCaseInput): Promise<ModerationCaseRow> {
    const now = nowIso();
    const rows = await sequelize.query<ModerationCaseRow>(
      `INSERT INTO moderation_cases AS mc
              (id, target_type, target_id, report_id, comment_id, state,
               ai_flagged, keyword_flagged, media_review, user_flag_count,
               categories, hold_reasons, priority, urgent, safety_risk, latest_run_id,
               opened_at, last_signal_at, created_on, updated_on)
       VALUES (:id, :targetType, :targetId, :reportId, :commentId, 'open',
               :aiFlagged, :keywordFlagged, :mediaReview, :userFlagIncrement,
               CAST(:categories AS jsonb), CAST(:holdReasons AS jsonb), 0, :urgent,
               NULLIF(:safetyRisk, 'none'), :latestRunId,
               :now, :now, now(), now())
       ON CONFLICT (target_type, target_id) WHERE state = 'open'
       DO UPDATE SET
               ai_flagged      = mc.ai_flagged OR EXCLUDED.ai_flagged,
               keyword_flagged = mc.keyword_flagged OR EXCLUDED.keyword_flagged,
               media_review    = mc.media_review OR EXCLUDED.media_review,
               user_flag_count = mc.user_flag_count + EXCLUDED.user_flag_count,
               categories      = (SELECT COALESCE(jsonb_agg(u.v ORDER BY u.first_pos), '[]'::jsonb)
                                    FROM (SELECT e.v, MIN(e.pos) AS first_pos
                                            FROM jsonb_array_elements_text(mc.categories || EXCLUDED.categories)
                                                 WITH ORDINALITY AS e(v, pos)
                                           GROUP BY e.v) AS u),
               hold_reasons    = (SELECT COALESCE(jsonb_agg(u.v ORDER BY u.first_pos), '[]'::jsonb)
                                    FROM (SELECT e.v, MIN(e.pos) AS first_pos
                                            FROM jsonb_array_elements_text(mc.hold_reasons || EXCLUDED.hold_reasons)
                                                 WITH ORDINALITY AS e(v, pos)
                                           GROUP BY e.v) AS u),
               urgent          = mc.urgent OR EXCLUDED.urgent,
               safety_risk     = COALESCE(EXCLUDED.safety_risk, mc.safety_risk),
               latest_run_id   = COALESCE(EXCLUDED.latest_run_id, mc.latest_run_id),
               last_signal_at  = EXCLUDED.last_signal_at,
               updated_on      = now()
       RETURNING ${CASE_COLUMNS}`,
      {
        replacements: {
          id: uuidv4(),
          targetType: input.targetType,
          targetId: input.targetId,
          reportId: input.reportId,
          commentId: input.commentId ?? null,
          aiFlagged: Boolean(input.aiFlagged),
          keywordFlagged: Boolean(input.keywordFlagged),
          mediaReview: Boolean(input.mediaReview),
          userFlagIncrement: Math.max(0, Math.floor(input.userFlagIncrement ?? 0)),
          categories: JSON.stringify(cleanCategories(input.categories)),
          holdReasons: JSON.stringify(cleanHoldReasons(input.holdReasons)),
          urgent: Boolean(input.urgent),
          safetyRisk: input.safetyRisk ?? null,
          latestRunId: input.latestRunId ?? null,
          now,
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );
    const row = rows[0];
    if (!row) throw new Error("moderation_cases upsert returned no row");

    const highSeverityViolation =
      input.highSeverityViolation ?? (await this.latestRunHasHighSeverity(tx, row.latest_run_id));
    const priority = this.priorityOf(row, highSeverityViolation);
    if (priority !== row.priority) {
      await sequelize.query(
        `UPDATE moderation_cases SET priority = :priority, updated_on = now() WHERE id = :id`,
        { replacements: { priority, id: row.id }, transaction: tx },
      );
      row.priority = priority;
    }
    return row;
  }

  /**
   * Resolve an open case atomically. Returns the resolved row, or `null` when
   * the case was not open any more (someone else decided first → 409).
   */
  async resolveCase(
    tx: Transaction,
    caseId: string,
    input: ResolveCaseInput,
  ): Promise<ModerationCaseRow | null> {
    const rows = await sequelize.query<ModerationCaseRow>(
      `UPDATE moderation_cases
          SET state = 'resolved',
              resolution = :resolution,
              resolved_at = :now,
              resolved_by = :resolvedBy,
              resolution_reason = :reasonCode,
              resolution_note = :publicNote,
              internal_note = COALESCE(:internalNote, internal_note),
              updated_on = now()
        WHERE id = :caseId AND state = 'open'
        RETURNING ${CASE_COLUMNS}`,
      {
        replacements: {
          caseId,
          resolution: input.resolution,
          resolvedBy: input.resolvedBy ?? null,
          reasonCode: input.reasonCode ?? null,
          publicNote: input.publicNote ?? null,
          internalNote: input.internalNote ?? null,
          now: nowIso(),
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );
    return rows[0] ?? null;
  }

  /**
   * The target's open case, or null. Pass a transaction and `lock: true` to
   * hold it `FOR UPDATE` — after the target row, per the lock order.
   */
  async findOpenCase(
    tx: Transaction | null,
    targetType: ModerationTargetType,
    targetId: string,
    options: { lock?: boolean } = {},
  ): Promise<ModerationCaseRow | null> {
    const lock = tx && options.lock ? " FOR UPDATE" : "";
    const rows = await sequelize.query<ModerationCaseRow>(
      `SELECT ${CASE_COLUMNS} FROM moderation_cases
        WHERE target_type = :targetType AND target_id = :targetId AND state = 'open'
        LIMIT 1${lock}`,
      {
        replacements: { targetType, targetId },
        type: QueryTypes.SELECT,
        transaction: tx ?? undefined,
      },
    );
    return rows[0] ?? null;
  }

  /** A case by id, open or resolved. `lock: true` holds it `FOR UPDATE`. */
  async findById(
    tx: Transaction | null,
    caseId: string,
    options: { lock?: boolean } = {},
  ): Promise<ModerationCaseRow | null> {
    const lock = tx && options.lock ? " FOR UPDATE" : "";
    const rows = await sequelize.query<ModerationCaseRow>(
      `SELECT ${CASE_COLUMNS} FROM moderation_cases WHERE id = :caseId LIMIT 1${lock}`,
      { replacements: { caseId }, type: QueryTypes.SELECT, transaction: tx ?? undefined },
    );
    return rows[0] ?? null;
  }

  /**
   * Resolve every open flag on a target — the approve ("No action needed") and
   * reject ("Action taken") decisions, and `closeForTarget`. Returns the flags
   * so the caller can email each reporter once the transaction has committed.
   */
  async resolveOpenFlags(
    tx: Transaction,
    targetType: ModerationTargetType,
    targetId: string,
    outcome: FlagOutcome,
  ): Promise<ResolvedFlagRow[]> {
    return sequelize.query<ResolvedFlagRow>(
      `UPDATE report_flags
          SET status = :status, resolution = :resolution, resolved_at = :now,
              resolved_by = :resolvedBy, updated_on = now()
        WHERE status = 'open' AND ${flagTargetSql(targetType)}
        RETURNING id, flag_ref, reporter_id, report_id, comment_id, case_id, reason, status, resolution`,
      {
        replacements: {
          targetId,
          status: outcome.status,
          resolution: outcome.resolution.slice(0, 512),
          resolvedBy: outcome.resolvedBy ?? null,
          now: nowIso(),
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );
  }

  /**
   * The target is going away (owner delete, comment removal, account erasure →
   * `withdrawn`) or being taken down (deactivation → `superseded`): withdraw its
   * queued run, resolve its open case, and resolve its open flags (§5.4, §7.8).
   *
   * Lock the target row before calling. The returned flags are for emailing the
   * reporters after the commit — never from inside the transaction.
   */
  async closeForTarget(tx: Transaction, input: CloseForTargetInput): Promise<CloseForTargetResult> {
    const runsCancelled = await cancelQueuedRunsForTarget(tx, input.targetType, input.targetId);

    const closed = await sequelize.query<ModerationCaseRow>(
      `UPDATE moderation_cases
          SET state = 'resolved', resolution = :resolution, resolved_at = :now,
              resolved_by = :resolvedBy, updated_on = now()
        WHERE target_type = :targetType AND target_id = :targetId AND state = 'open'
        RETURNING ${CASE_COLUMNS}`,
      {
        replacements: {
          targetType: input.targetType,
          targetId: input.targetId,
          resolution: input.resolution,
          resolvedBy: input.resolvedBy ?? null,
          now: nowIso(),
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );

    const flags = await this.resolveOpenFlags(tx, input.targetType, input.targetId, {
      ...input.flagOutcome,
      resolvedBy: input.flagOutcome.resolvedBy ?? input.resolvedBy ?? null,
    });

    return { closedCase: closed[0] ?? null, flags, runsCancelled };
  }

  /**
   * Re-derive an open case's user-flag signal from the flags still open on its
   * target, after some were closed out from under it — the flags of a member
   * who was just banned (review Q2). `user_flag_count` becomes the number of
   * open flags; `user_flags` leaves `hold_reasons` when none is left; and when
   * nothing but flags raised the case (no AI or keyword signal, so every
   * category on it came from a flag) its categories become the open flags'
   * categories, so a brigader's "threat" stops adding 40 to its priority.
   * Priority is recomputed. The case stays open — it is still in front of a
   * human, who decides it on what is left.
   *
   * Lock the target row and then the case (`findOpenCase(…, { lock: true })`)
   * before calling: this is a read-modify-write of the case row.
   */
  async recountFlagSignals(tx: Transaction, row: ModerationCaseRow): Promise<ModerationCaseRow> {
    const flags = await sequelize.query<{ reason: string | null }>(
      `SELECT reason FROM report_flags
        WHERE status = 'open' AND ${flagTargetSql(row.target_type)}
        ORDER BY created_at ASC`,
      { replacements: { targetId: row.target_id }, type: QueryTypes.SELECT, transaction: tx },
    );
    const signal = recountedFlagSignal(row, flags.map((flag) => flag.reason));
    const next: ModerationCaseRow = {
      ...row,
      user_flag_count: signal.userFlagCount,
      categories: signal.categories,
      hold_reasons: signal.holdReasons,
    } as ModerationCaseRow;
    next.priority = this.priorityOf(next, await this.latestRunHasHighSeverity(tx, row.latest_run_id));
    await sequelize.query(
      `UPDATE moderation_cases
          SET user_flag_count = :userFlagCount,
              categories = CAST(:categories AS jsonb),
              hold_reasons = CAST(:holdReasons AS jsonb),
              priority = :priority,
              updated_on = now()
        WHERE id = :id AND state = 'open'`,
      {
        replacements: {
          id: row.id,
          userFlagCount: signal.userFlagCount,
          categories: JSON.stringify(signal.categories),
          holdReasons: JSON.stringify(signal.holdReasons),
          priority: next.priority,
        },
        transaction: tx,
      },
    );
    return next;
  }

  // ── Priority ──────────────────────────────────────────────────────────────

  /** §4.4, from the stored case plus the one bit it does not store. */
  priorityOf(row: ModerationCaseRow, highSeverityViolation: boolean): number {
    const holdReasons = Array.isArray(row.hold_reasons) ? row.hold_reasons : [];
    const categories = Array.isArray(row.categories) ? row.categories : [];
    const mediaOnly =
      row.media_review &&
      !row.ai_flagged &&
      !row.keyword_flagged &&
      row.user_flag_count === 0 &&
      holdReasons.every((reason) => reason === "media_unassessed");
    return casePriority({
      urgent: row.urgent,
      safetyRisk: row.safety_risk,
      categories,
      highSeverityViolation,
      userFlagCount: row.user_flag_count,
      mediaOnly,
    });
  }

  /** Did the case's latest run find a violated category with severity `high`? */
  private async latestRunHasHighSeverity(
    tx: Transaction,
    runId: string | null | undefined,
  ): Promise<boolean> {
    if (!runId) return false;
    const rows = await sequelize.query<{ high: boolean }>(
      `SELECT EXISTS (
                SELECT 1
                  FROM moderation_runs r,
                       jsonb_array_elements(
                         CASE WHEN jsonb_typeof(r.ai_categories) = 'array'
                              THEN r.ai_categories ELSE '[]'::jsonb END
                       ) AS c(verdict)
                 WHERE r.id = :runId
                   AND c.verdict->>'violation' = 'true'
                   AND c.verdict->>'severity' = 'high'
              ) AS high`,
      { replacements: { runId }, type: QueryTypes.SELECT, transaction: tx },
    );
    return Boolean(rows[0]?.high);
  }
}

export const moderationCaseService = new ModerationCaseService();
export default moderationCaseService;
