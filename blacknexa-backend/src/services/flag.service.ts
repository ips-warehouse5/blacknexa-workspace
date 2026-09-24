/**
 * Member flags on reports and comments — screens D8/D9.
 *
 * docs/INCIDENT_MODULE_PLAN.md §7.6, D6–D8, §4.2, §5.1 and §5.4. Flags used to
 * be two `ReportFlag.create` calls in the controller: no dedupe (one member
 * could flag the same report fifty times), no existence check on comments (a
 * flag on any UUID "succeeded"), an owner could flag their own report, and
 * nothing connected a flag to anything a moderator worked from. Now:
 *
 *   lock the target → it must exist and be readable by the flagger → refuse the
 *   flagger's own content → normalise the category → dedupe → merge into the
 *   target's moderation case → maybe queue one AI re-check → audit.
 *
 * ── Categories (D6/D7) ────────────────────────────────────────────────────
 * The flag sheet sends one of the eight policy codes, or — from shipped clients —
 * one of the three legacy codes, which `normaliseFlagCategory` maps before
 * anything is stored. A comment accepts six (§3.1).
 *
 * ── Idempotency ───────────────────────────────────────────────────────────
 *   • A member's *open* flag on the target is returned as-is (200), so a double
 *     tap or a retried request neither inflates the case's flag count nor burns
 *     a `FLG-####`. Every flagger locks the target row first, so the pre-check
 *     under that lock is race-free; the partial unique indexes
 *     (`uq_report_flags_open_report` / `_comment`, §4.2) are the backstop, and
 *     their 23505 is answered the same way, outside the rolled-back transaction.
 *   • A member re-flagging content a moderator already *dismissed* their flag
 *     on, at the same content version, gets that flag back (200) and no new
 *     re-check: the content has not changed since a human looked. An edit bumps
 *     the version, and then a fresh flag is a fresh signal.
 *
 * ── Anti-brigading (D8) ───────────────────────────────────────────────────
 * A flag never hides anything by itself and never raises a verdict — it adds to
 * the case's `user_flag_count` (priority only) and may queue a `flagged` AI
 * re-check, which alone can auto-hide, and only on a verbatim quote from the
 * content (the pipeline's rule). The re-check is queued only when:
 *
 *   • the target is published (`approved`) and moderated (never private, D3);
 *   • no human has approved this content version (reports:
 *     `human_reviewed_version`; comments: a human-resolved `approved` case);
 *   • the flagger's account is at least `MODERATION_FLAG_MIN_ACCOUNT_AGE_DAYS`
 *     old — a fresh sock-puppet can raise priority, not trigger the AI;
 *   • it is the first such flag for this content version, and no `flagged` run
 *     for the target was queued in the last 15 minutes (`FLAG_RECHECK_THROTTLE_MS`).
 *
 * The AI is sent only the *set* of flagged categories — never notes or counts —
 * which is the pipeline's side of the same rule.
 *
 * ── Lock order ────────────────────────────────────────────────────────────
 * Target row (report or comment) → case (upsert) → flag rows, as
 * `moderation_case.service.ts` requires of every writer. A comment flag also
 * locks the comment's report right after the comment (comment → report → case,
 * the order `setCommentState` and account deletion take), so it cannot race the
 * report's deletion — review R3.
 */

import { Op, QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger, { runBackground } from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report } from "@/models/report.model";
import { ReportComment, ReportFlag } from "@/models/report_social.model";
import { AppUser } from "@/models/app_user.model";
import moderationCaseService, {
  type FlagOutcome,
  type ResolvedFlagRow,
} from "@/services/moderation_case.service";
import { enqueueRun } from "@/services/moderation_enqueue";
import { pokeModeration } from "@/services/moderation_signal";
import auditService from "@/services/audit.service";
import mailerService from "@/services/mailer.service";
import { isCounted } from "@/services/comment_state";
import { canReadReport, type MemberViewer } from "@/services/report_visibility";
import { isUniqueViolation, lockedTransaction, nextRefInTx } from "@/services/report_tx";
import { badRequest, notFound } from "@/middlewares/error.middleware";
import {
  FLAG_RECHECK_THROTTLE_MS,
  RUN_PRIORITY,
  flagExpectedWithin,
  needsModeration,
  normaliseCommentFlagCategory,
  normaliseFlagCategory,
  type ModerationTargetType,
  type PolicyCategory,
} from "@/types/moderation.interface";

/** What the flag sheet sends. `reason` may be a legacy code; it is normalised here. */
export interface FlagInput {
  reason: string;
  note?: string | null;
}

/** D9's confirmation. `authorIsTold` is kept for the shipped client. */
export interface FlagReceipt {
  flagRef: string;
  authorIsTold: "Nothing about you";
  expectedWithin: "within the hour" | "within a day";
}

export interface FlagResult {
  receipt: FlagReceipt;
  /** False when an existing flag was returned (200 rather than 201). */
  created: boolean;
}

/** A flag resolution, as written to the rows and as emailed to the reporter. */
export interface FlagClosure {
  outcome: FlagOutcome;
  mail: { outcome: string; detail: string };
}

/**
 * The target went away because its author removed it — owner delete, comment
 * removal, account erasure (§5.4: flags resolved "The author removed it").
 */
export const AUTHOR_REMOVED: FlagClosure = {
  outcome: { status: "resolved", resolution: "The author removed it." },
  mail: {
    outcome: "Removed by the author",
    detail:
      "The person who posted it removed it, so there is nothing left for a moderator to review. Thank you for flagging it.",
  },
};

const NOTE_MAX = 1024;

/** Everything `recordFlag` needs about the (locked) target. */
interface FlagTarget {
  targetType: ModerationTargetType;
  targetId: string;
  report: Report;
  comment: ReportComment | null;
  category: PolicyCategory;
  note: string | null;
  contentVersion: number;
  /** The target's publication state. Only `approved` content is re-checked. */
  targetState: string;
  /** A human approved this exact content version (D8: never auto-hidden again). */
  humanCleared: boolean;
}

interface RecordedFlag {
  flag: ReportFlag;
  created: boolean;
  runQueued: boolean;
}

class FlagService {
  /** `POST /reports/:id/flags`. `reportId` is the id of a report the caller could load. */
  async flagReport(reportId: string, viewer: MemberViewer, input: FlagInput): Promise<FlagResult> {
    const category = normaliseFlagCategory(input.reason);
    if (!category) throw badRequest("Choose a reason.");
    const note = cleanNote(input.note);

    try {
      const recorded = await lockedTransaction(async (transaction) => {
        const report = await Report.findByPk(reportId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!report || !canReadReport(report, viewer)) throw notFound("That report is not available.");
        if (report.user_id === viewer.id) throw badRequest("You can't flag your own report.");

        return this.recordFlag(transaction, viewer, {
          targetType: "report",
          targetId: report.id,
          report,
          comment: null,
          category,
          note,
          contentVersion: report.content_version,
          targetState: report.moderation_state,
          humanCleared: report.human_reviewed_version === report.content_version,
        });
      });
      return this.finish(recorded, category);
    } catch (err) {
      const existing = await this.recoverDuplicate(err, "report", reportId, viewer.id);
      if (existing) return existing;
      throw err;
    }
  }

  /** `POST /comments/:id/flags`. Six categories (§3.1). */
  async flagComment(commentId: string, viewer: MemberViewer, input: FlagInput): Promise<FlagResult> {
    const category = normaliseCommentFlagCategory(input.reason);
    if (!category) throw badRequest("Choose a reason that fits a comment.");
    const note = cleanNote(input.note);

    try {
      const recorded = await lockedTransaction(async (transaction) => {
        // The comment is the target, so it is the row locked first.
        const comment = await ReportComment.findByPk(commentId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!comment) throw notFound("That comment is not available.");
        /*
         * The parent report is locked too, after the comment (review R3) — the
         * comment → report order `setCommentState` and account deletion use. Read
         * unlocked, a flag racing the report's deletion (or its author's erasure)
         * saw it not yet deleted and opened a case and an open flag the delete's
         * own snapshot could not see and close: a stuck queue item on a deleted
         * report, and a flagger never told "the author removed it". Locked, the
         * delete either commits first (this sees `deleted_at` and 404s) or waits
         * for this commit and then closes the case and flag it can now see.
         */
        const report = await Report.findByPk(comment.report_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        // Only a comment the flagger can actually see: shown to others, on a
        // live report they can read. Anything else is a 404, never a 403.
        // Review Q8: a deactivated report's owner can still read it, but its
        // comments are out of moderation until Reactivate — a flag here would
        // open a case no decision can close (they all answer 409).
        const shown = isCounted({ status: comment.status, moderationState: comment.moderation_state });
        if (
          !report ||
          report.deleted_at ||
          report.moderation_state === "deactivated" ||
          !shown ||
          !canReadReport(report, viewer)
        ) {
          throw notFound("That comment is not available.");
        }
        if (comment.user_id === viewer.id) throw badRequest("You can't flag your own comment.");

        return this.recordFlag(transaction, viewer, {
          targetType: "comment",
          targetId: comment.id,
          report,
          comment,
          category,
          note,
          // Comments are immutable, so every flag is against their one version.
          contentVersion: 1,
          targetState: comment.moderation_state,
          humanCleared: await this.commentHumanCleared(transaction, comment.id),
        });
      });
      return this.finish(recorded, category);
    } catch (err) {
      const existing = await this.recoverDuplicate(err, "comment", commentId, viewer.id);
      if (existing) return existing;
      throw err;
    }
  }

  /**
   * Email every reporter whose flag was just resolved — after the commit, never
   * from inside the transaction, and detached: a mail failure must not fail a
   * request whose change already landed.
   */
  notifyReporters(flags: readonly ResolvedFlagRow[], mail: FlagClosure["mail"]): void {
    const owed = flags.filter((flag) => Boolean(flag.reporter_id));
    if (owed.length === 0) return;
    runBackground(
      (async () => {
        const reporterIds = [...new Set(owed.map((flag) => flag.reporter_id as string))];
        const reporters = await AppUser.findAll({
          where: { id: { [Op.in]: reporterIds } },
          attributes: ["id", "email"],
        });
        const emailById = new Map(reporters.map((row) => [row.id, row.email]));
        for (const flag of owed) {
          const email = emailById.get(flag.reporter_id as string);
          if (!email) continue;
          await mailerService.sendFlagOutcome(email, flag.flag_ref, mail.outcome, mail.detail);
        }
      })(),
      "flag outcome mail",
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Dedupe, case upsert, insert, maybe re-check, audit — inside the target lock. */
  private async recordFlag(
    tx: Transaction,
    viewer: MemberViewer,
    target: FlagTarget,
  ): Promise<RecordedFlag> {
    const targetWhere = flagTargetWhere(target.targetType, target.targetId);

    const open = await ReportFlag.findOne({
      where: { ...targetWhere, reporter_id: viewer.id, status: "open" },
      transaction: tx,
    });
    if (open) return { flag: open, created: false, runQueued: false };

    const dismissed = await ReportFlag.findOne({
      where: {
        ...targetWhere,
        reporter_id: viewer.id,
        status: "dismissed",
        content_version: target.contentVersion,
      },
      order: [["created_at", "DESC"]],
      transaction: tx,
    });
    if (dismissed) return { flag: dismissed, created: false, runQueued: false };

    // Target → case → flag: the case first, so the flag can carry its id.
    const openCase = await moderationCaseService.upsertOpenCase(tx, {
      targetType: target.targetType,
      targetId: target.targetId,
      reportId: target.report.id,
      commentId: target.comment?.id ?? null,
      userFlagIncrement: 1,
      categories: [target.category],
      holdReasons: ["user_flags"],
    });

    const flag = await ReportFlag.create(
      {
        flag_ref: await nextRefInTx(tx, "flag"),
        // A comment flag also carries its parent report, so a moderator (and the
        // purge) can reach it without a join. Report-level queries filter on
        // `comment_id IS NULL`, exactly like the partial unique index.
        report_id: target.report.id,
        comment_id: target.comment?.id ?? null,
        reporter_id: viewer.id,
        reason: target.category,
        note: target.note,
        content_version: target.contentVersion,
        case_id: openCase.id,
        created_at: nowIso(),
      },
      { transaction: tx },
    );

    const runQueued = await this.maybeQueueRecheck(tx, viewer, target, openCase.id);

    await auditService.record(tx, {
      actorKind: "member",
      actorId: viewer.id,
      action: "flag.create",
      targetType: "flag",
      targetId: flag.id,
      reportId: target.report.id,
      caseId: openCase.id,
      reasonCode: target.category,
      metadata: {
        target: target.targetType,
        targetId: target.targetId,
        contentVersion: target.contentVersion,
        recheckQueued: runQueued,
      },
    });

    return { flag, created: true, runQueued };
  }

  /** The D8 conditions for a `flagged` AI re-check — see the file header. */
  private async maybeQueueRecheck(
    tx: Transaction,
    viewer: MemberViewer,
    target: FlagTarget,
    caseId: string,
  ): Promise<boolean> {
    if (!needsModeration(target.report)) return false;
    if (target.targetState !== "approved") return false;
    if (target.report.moderation_state !== "approved") return false;
    if (target.humanCleared) return false;
    if (!(await this.accountOldEnough(tx, viewer.id))) return false;

    const since = new Date(Date.now() - FLAG_RECHECK_THROTTLE_MS).toISOString();
    const earlier = await sequelize.query<{ one: number }>(
      `SELECT 1 AS one FROM moderation_runs
        WHERE target_type = :targetType AND target_id = :targetId
          AND "trigger" = 'flagged' AND status <> 'cancelled'
          AND (content_version = :contentVersion OR created_at >= :since)
        LIMIT 1`,
      {
        replacements: {
          targetType: target.targetType,
          targetId: target.targetId,
          contentVersion: target.contentVersion,
          since,
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );
    if (earlier.length > 0) return false;

    await enqueueRun(tx, {
      targetType: target.targetType,
      targetId: target.targetId,
      reportId: target.report.id,
      commentId: target.comment?.id ?? null,
      caseId,
      contentVersion: target.contentVersion,
      trigger: "flagged",
      priority: RUN_PRIORITY.flagged,
    });
    return true;
  }

  /** D8: only accounts at least `flagMinAccountAgeDays` old trigger the AI. */
  private async accountOldEnough(tx: Transaction, userId: string): Promise<boolean> {
    const days = env.moderation.flagMinAccountAgeDays;
    if (days <= 0) return true;
    const user = await AppUser.findByPk(userId, { attributes: ["id", "created_on"], transaction: tx });
    const createdOn = user?.get("created_on") as Date | string | null | undefined;
    if (!createdOn) return false;
    const createdMs = new Date(createdOn).getTime();
    if (Number.isNaN(createdMs)) return false;
    return Date.now() - createdMs >= days * 24 * 60 * 60 * 1000;
  }

  /** A comment has no version column; a human-approved case clears it for good. */
  private async commentHumanCleared(tx: Transaction, commentId: string): Promise<boolean> {
    const rows = await sequelize.query<{ one: number }>(
      `SELECT 1 AS one FROM moderation_cases
        WHERE target_type = 'comment' AND target_id = :commentId
          AND state = 'resolved' AND resolution = 'approved' AND resolved_by IS NOT NULL
        LIMIT 1`,
      { replacements: { commentId }, type: QueryTypes.SELECT, transaction: tx },
    );
    return rows.length > 0;
  }

  /** After a successful commit: wake the worker, shape the receipt. */
  private finish(recorded: RecordedFlag, category: PolicyCategory): FlagResult {
    if (recorded.runQueued) pokeModeration();
    if (recorded.created) {
      logger.info("[flags] flag recorded", {
        flagRef: recorded.flag.flag_ref,
        category,
        recheckQueued: recorded.runQueued,
      });
    }
    return { receipt: receiptFor(recorded.flag), created: recorded.created };
  }

  /**
   * The backstop for a concurrent duplicate: the partial unique index fired, the
   * transaction rolled back, and the flag that won is returned instead (§5.4).
   */
  private async recoverDuplicate(
    err: unknown,
    targetType: ModerationTargetType,
    targetId: string,
    reporterId: string,
  ): Promise<FlagResult | null> {
    if (!isUniqueViolation(err)) return null;
    const existing = await ReportFlag.findOne({
      where: { ...flagTargetWhere(targetType, targetId), reporter_id: reporterId, status: "open" },
    });
    return existing ? { receipt: receiptFor(existing), created: false } : null;
  }
}

/** The flag rows of one target — report flags have no `comment_id` (§4.2). */
function flagTargetWhere(
  targetType: ModerationTargetType,
  targetId: string,
): Record<string, unknown> {
  return targetType === "comment"
    ? { comment_id: targetId }
    : { report_id: targetId, comment_id: null };
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = typeof note === "string" ? note.trim() : "";
  return trimmed ? trimmed.slice(0, NOTE_MAX) : null;
}

/** D9's receipt, from the stored (canonical or legacy) reason. */
function receiptFor(flag: ReportFlag): FlagReceipt {
  const category = normaliseFlagCategory(flag.reason) ?? "other";
  return {
    flagRef: flag.flag_ref,
    authorIsTold: "Nothing about you",
    expectedWithin: flagExpectedWithin(category),
  };
}

export const flagService = new FlagService();
export default flagService;
