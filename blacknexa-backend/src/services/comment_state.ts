/**
 * The one way a comment's visibility changes — and `comment_count` with it.
 *
 * docs/INCIDENT_MODULE_PLAN.md §7.5. A comment now has two fields that decide
 * whether other members see it: `status` (visible / hidden / removed) and
 * `moderation_state` (pending / approved / held / rejected). It is shown, and
 * counted in `reports.comment_count`, only when it is `visible` **and**
 * `approved` — the `isCounted` predicate below.
 *
 * ── Why a single function owns every transition ───────────────────────────
 * The counter drifted before revision 2 because each writer adjusted it with
 * its own assumption: owner delete decremented unconditionally, so deleting a
 * comment a moderator had already hidden decremented twice; hiding a removed
 * comment did the same. With a second axis there are sixteen before/after
 * pairs, and hand-written ±1s in five services would get some of them wrong.
 *
 * So every state change — creation aside — goes through `setCommentState`:
 * it locks the comment row, writes the new state, and applies
 *
 *     delta = counted(after) − counted(before)        ∈ {−1, 0, +1}
 *
 * to the report's counter in SQL. Approving a pending comment is +1, removing
 * an approved one −1, removing a held one 0, re-approving after a hide +1 —
 * all by the same line, whatever the order or repetition. The nightly
 * `reconcileCounters` and account deletion use the same predicate
 * (`COUNTED_COMMENT_WHERE` / `COUNTED_COMMENT_SQL`), so the repair job and the
 * live path cannot disagree about what "counted" means.
 *
 * Lock order: the comment row, then its report row (the counter UPDATE). This
 * matches the moderation lock order — target first — in
 * `moderation_case.service.ts`; a caller that also touches the comment's case
 * locks the comment (via this function or its own `FOR UPDATE`) before the case.
 */

import type { Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import { nowIso } from "@/models/model_options";
import { ReportComment } from "@/models/report_social.model";
import { notFound } from "@/middlewares/error.middleware";
import type { CommentModerationState, CommentStatus } from "@/types/moderation.interface";

/** The part of a comment's state this module reasons about. */
export interface CommentStateSnapshot {
  status: CommentStatus;
  moderationState: CommentModerationState;
  moderationReason: string | null;
}

/** A transition. Omitted fields keep their current value; `null` clears the reason. */
export interface CommentStateChange {
  status?: CommentStatus;
  moderationState?: CommentModerationState;
  moderationReason?: string | null;
}

export interface CommentStateResult {
  commentId: string;
  reportId: string;
  before: CommentStateSnapshot;
  after: CommentStateSnapshot;
  /** What was applied to `reports.comment_count`: −1, 0 or +1. */
  delta: number;
}

/** Shown to others and counted: `visible` and `approved`. */
export function isCounted(state: { status: string; moderationState: string }): boolean {
  return state.status === "visible" && state.moderationState === "approved";
}

/** The same predicate as a Sequelize `where` fragment, for counts and recounts. */
export const COUNTED_COMMENT_WHERE = { status: "visible", moderation_state: "approved" } as const;

/** The same predicate as SQL, for raw recounts (`reconcileCounters`). Column names unqualified. */
export const COUNTED_COMMENT_SQL = "status = 'visible' AND moderation_state = 'approved'";

/**
 * Change a comment's status and/or moderation state inside `tx`, keeping
 * `reports.comment_count` exact. Throws 404 if the comment does not exist.
 *
 * `moderated_at` is stamped whenever a moderation state is supplied — that is a
 * decision, even when it restates the current value (a moderator keeping an
 * approved comment).
 */
export async function setCommentState(
  tx: Transaction,
  commentId: string,
  next: CommentStateChange,
): Promise<CommentStateResult> {
  const comment = await ReportComment.findByPk(commentId, {
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  if (!comment) throw notFound("That comment no longer exists.");

  const before: CommentStateSnapshot = {
    status: comment.status,
    moderationState: comment.moderation_state,
    moderationReason: comment.moderation_reason ?? null,
  };
  const after: CommentStateSnapshot = {
    status: next.status ?? before.status,
    moderationState: next.moderationState ?? before.moderationState,
    moderationReason:
      next.moderationReason === undefined ? before.moderationReason : next.moderationReason,
  };

  await comment.update(
    {
      status: after.status,
      moderation_state: after.moderationState,
      moderation_reason: after.moderationReason,
      ...(next.moderationState !== undefined ? { moderated_at: nowIso() } : {}),
    },
    { transaction: tx },
  );

  const delta = Number(isCounted(after)) - Number(isCounted(before));
  if (delta !== 0) {
    // In SQL, under the row lock the UPDATE takes: two transitions committing
    // at once both land. Floored at zero so a counter that had already drifted
    // low is not driven negative before the nightly reconcile repairs it.
    await sequelize.query(
      `UPDATE reports
          SET comment_count = GREATEST(comment_count + :delta, 0), updated_on = now()
        WHERE id = :reportId`,
      { replacements: { delta, reportId: comment.report_id }, transaction: tx },
    );
  }

  return { commentId: comment.id, reportId: comment.report_id, before, after, delta };
}
