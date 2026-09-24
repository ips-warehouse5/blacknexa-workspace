/**
 * Account deletion — `DERIVED`, and required by both app stores and by GDPR.
 *
 * Nothing in sections A–D covers it, which is exactly why it needs writing down:
 * the interesting question is not how to delete a row, it is what happens to
 * everything the person built while they were here.
 *
 * ── The three-way split ────────────────────────────────────────────────────
 * Every row touching a member falls into one of three buckets, and which bucket it
 * lands in is a judgement, not a technicality:
 *
 *   1. **The person.** Account, sessions, linked social identities, password
 *      history, consents, notifications, saved settings. Always destroyed. This is
 *      the part "delete my account" plainly means.
 *
 *   2. **Their activity on other people's reports.** Their supports, their
 *      corroborations, their comments, their likes, their hidden-from-feed choices.
 *      Always removed, under both dispositions, because none of it is community
 *      record — it is a trail of one person's presence, and leaving it behind while
 *      claiming the account is gone would be false. Every counter it fed is
 *      decremented in the same transaction so D1's footer stays true, and every
 *      corroboration removed triggers a strength recount on the report it propped
 *      up — otherwise a report keeps a score it no longer earns.
 *
 *   3. **The reports they filed.** The owner chooses, because both answers cost
 *      something real and neither is ours to pick:
 *        • `sever` — the identity link is cut and cannot be restored. The reports
 *          stay as anonymous record, with the corroborations and comments other
 *          people added. Severing means null, not a placeholder id: evidence rows
 *          lose their owner too, so nothing in the database can re-link the record
 *          to a person afterwards.
 *        • `erase` — soft-deleted with a 30-day evidence purge, the same path as
 *          deleting one report by hand.
 *
 * ── Two things that survive on purpose ─────────────────────────────────────
 *   • **Flags they raised.** A flag is a safety signal about someone else's
 *     content. The reporter is severed; the flag stays open for a moderator.
 *   • **One audit row**, keyed by a SHA-256 of the email and holding no other
 *     identifying field. It is how "did you actually delete me?" gets answered
 *     months later without keeping the person in order to answer it.
 *
 * The whole thing runs in one transaction. A half-deleted account is the worst of
 * the available outcomes: signed out, unreachable, and still present.
 *
 * ── Revision 2: moderation (docs/INCIDENT_MODULE_PLAN.md §7.5, §7.8) ────────
 *   • **Their comments** leave through `setCommentState`, which locks each row and
 *     moves `comment_count` by exactly what that comment contributed — only a
 *     `visible AND approved` comment was ever counted, so removing a pending or
 *     held one changes nothing and removing a hidden one no longer double-counts.
 *     Each removed comment's queued run is withdrawn and its open case resolved
 *     `withdrawn` (`moderationCaseService.closeForTarget`).
 *   • **Erased reports** withdraw their moderation work exactly like an owner
 *     delete: queued runs cancelled, open cases (theirs and their comments')
 *     resolved `withdrawn`, open flags resolved "The author removed it".
 *   • **Flaggers are told** — by email, after the commit, never from inside it.
 *   • **The audit log forgets the member** (§4.6, §7.8): `actor_id` and `ip` are
 *     nulled on the rows where they were the actor. It is one of the only two
 *     mutations the audit log permits.
 *   • **The AI forgets their words** (review R6): `ai_summary` and every verdict's
 *     verbatim `evidence` / `evidenceEnglish` quote are nulled on the moderation
 *     runs of their comments and of their reports (severed or erased), in the
 *     same transaction — codes, confidences and severities stay for the audit.
 */

import crypto from "node:crypto";
import { Op } from "sequelize";
import type { Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger, { runBackground } from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import {
  AccountDeletion,
  AppUser,
  EmailOtp,
  PasswordHistory,
  UserConsent,
  UserIdentity,
  UserSession,
} from "@/models/app_user.model";
import {
  Report,
  ReportDraft,
  ReportEvidence,
  ReportStatusEvent,
} from "@/models/report.model";
import {
  CommentLike,
  Notification,
  ReportComment,
  ReportCorroboration,
  ReportFlag,
  ReportHide,
  ReportShareLink,
  ReportSupport,
} from "@/models/report_social.model";
import reportService from "@/services/report.service";
import mailerService from "@/services/mailer.service";
import auditService from "@/services/audit.service";
import moderationCaseService, { type ResolvedFlagRow } from "@/services/moderation_case.service";
import flagService, { AUTHOR_REMOVED } from "@/services/flag.service";
import { setCommentState } from "@/services/comment_state";
import { notFound } from "@/middlewares/error.middleware";

/** What happens to the reports the person filed. */
export type Disposition = "sever" | "erase";

export interface DeletionReceipt {
  disposition: Disposition;
  reportsSevered: number;
  reportsErased: number;
  commentsRemoved: number;
  supportsRemoved: number;
  corroborationsRemoved: number;
  /** ISO date after which sealed files are destroyed. Null when nothing was erased. */
  filesPurgedAfter: string | null;
}

/** SHA-256 of the normalised email. The audit row never sees the address itself. */
function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

class AccountDeletionService {
  /**
   * Delete an account.
   *
   * Returns a receipt rather than nothing, because the client shows the person what
   * happened before signing them out — and because a silent delete gives support no
   * way to answer a question about it later.
   */
  async deleteAccount(userId: string, disposition: Disposition): Promise<DeletionReceipt> {
    const user = await AppUser.scope("withSecret").findByPk(userId);
    if (!user) throw notFound("That account no longer exists.");

    // Captured before the row goes, so the farewell mail can still be addressed.
    const email = user.email;
    const at = nowIso();
    const purgeAfter = new Date(
      Date.now() + env.reports.evidenceRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const owned = await Report.findAll({
      where: { user_id: userId, deleted_at: null },
      attributes: ["id"],
    });
    const ownedIds = owned.map((row) => row.id);

    // Read the activity rows before the transaction so the counter arithmetic below
    // works from a known set rather than from whatever a `DELETE … RETURNING` gives
    // back — Sequelize does not report affected rows uniformly across dialects.
    const [supports, corroborations, comments, likes] = await Promise.all([
      ReportSupport.findAll({ where: { user_id: userId }, attributes: ["report_id"] }),
      ReportCorroboration.findAll({ where: { user_id: userId }, attributes: ["report_id"] }),
      ReportComment.findAll({ where: { user_id: userId } }),
      CommentLike.findAll({ where: { user_id: userId }, attributes: ["comment_id"] }),
    ]);

    let reportsSevered = 0;
    let reportsErased = 0;
    // Flags resolved because the content they were about went away — their
    // reporters are emailed once the transaction has committed.
    const resolvedFlags: ResolvedFlagRow[] = [];

    await sequelize.transaction(async (transaction) => {
      // ── 2. Their activity on other people's reports ──────────────────────
      resolvedFlags.push(
        ...(await this.removeActivity(userId, { supports, corroborations, comments, likes }, transaction)),
      );

      // ── 3. The reports they filed ────────────────────────────────────────
      if (ownedIds.length > 0) {
        if (disposition === "sever") {
          await Report.update(
            // Anonymous as well as ownerless: without this the feed would keep
            // rendering a display name it can no longer look up.
            { user_id: null, anonymous: true },
            { where: { id: { [Op.in]: ownedIds } }, transaction },
          );
          // The files must lose the owner too, or "cannot be restored" is untrue.
          await ReportEvidence.update(
            { user_id: null },
            { where: { report_id: { [Op.in]: ownedIds } }, transaction },
          );
          // Their own entries on their own timelines — "Filed by you" becomes
          // "Filed", which is what an anonymous record should read as.
          await ReportStatusEvent.update(
            { actor_id: null },
            {
              where: { report_id: { [Op.in]: ownedIds }, actor_kind: "owner" },
              transaction,
            },
          );
          reportsSevered = ownedIds.length;
        } else {
          // The same path as deleting one report by hand: soft-delete now, files
          // destroyed after the retention window. Children are left in place
          // because the report is already unreachable, and the purge job removes
          // them with it.
          await Report.update(
            { deleted_at: at },
            { where: { id: { [Op.in]: ownedIds } }, transaction },
          );
          await ReportEvidence.update(
            { purge_after: purgeAfter },
            { where: { report_id: { [Op.in]: ownedIds } }, transaction },
          );
          // The same withdrawal as an owner delete (§7.8): queued runs, open
          // cases and open flags on each report and its comments.
          for (const reportId of ownedIds) {
            resolvedFlags.push(
              ...(await reportService.closeModerationForRemovedReport(transaction, reportId)),
            );
          }
          reportsErased = ownedIds.length;
        }

        // Under both dispositions the AI's verbatim quotes and summaries of
        // their reports go now (review R6): a severed report stays as record,
        // but the moderation rows need only the codes and scores, and an erased
        // one must not wait out the 30-day purge with its words still quoted.
        //
        // After the `Report.update` above, never before it. A worker's apply
        // locks the report row first and writes its run's summary last, so a
        // redaction that ran first found nothing on that run yet, the update
        // then waited for the worker's commit, and the worker's quotes outlived
        // the erasure. The update now waits for any such worker, and this sees
        // what it committed; a worker that comes second sees `deleted_at` under
        // its lock and stores nothing (an erased report), and the order here —
        // report, then runs — is the worker's own, so the two cannot deadlock.
        await redactModerationText(transaction, { reportIds: ownedIds });
      }

      // Drafts go under both dispositions — an unfinished report was never record.
      await ReportDraft.destroy({ where: { user_id: userId }, transaction });
      // Evidence uploaded against a draft has no report to belong to, so it is
      // purged rather than orphaned in the bucket.
      await ReportEvidence.update(
        { purge_after: purgeAfter },
        { where: { user_id: userId, report_id: null }, transaction },
      );

      // Share links they minted stop working. Keeping them alive would let a link
      // handed out last week outlive the account that chose to publish it.
      await ReportShareLink.destroy({ where: { created_by: userId }, transaction });

      // Flags survive; the reporter does not. See the header.
      await ReportFlag.update(
        { reporter_id: null },
        { where: { reporter_id: userId }, transaction },
      );

      // The audit log keeps what they did and forgets who did it (§7.8).
      await auditService.nullMemberActor(transaction, userId);

      // ── 1. The person ────────────────────────────────────────────────────
      await Notification.destroy({ where: { user_id: userId }, transaction });
      await UserSession.destroy({ where: { user_id: userId }, transaction });
      await UserIdentity.destroy({ where: { user_id: userId }, transaction });
      await PasswordHistory.destroy({ where: { user_id: userId }, transaction });
      await UserConsent.destroy({ where: { user_id: userId }, transaction });
      // Keyed by email, not by id — so they have to go by email as well, or a
      // pending code would outlive the account it was issued for.
      await EmailOtp.destroy({ where: { email }, transaction });

      await AccountDeletion.create(
        {
          email_hash: hashEmail(email),
          disposition,
          reports_severed: reportsSevered,
          reports_erased: reportsErased,
          comments_removed: comments.length,
          requested_at: at,
        },
        { transaction },
      );

      // `force` because `AppUser` is paranoid: a soft-deleted account is a retained
      // account, which is the one thing this endpoint must not leave behind.
      await user.destroy({ force: true, transaction });
    });

    // Outside the transaction, and fire-and-forget: a mail failure must not undo a
    // deletion that has already succeeded.
    flagService.notifyReporters(resolvedFlags, AUTHOR_REMOVED.mail);
    runBackground(
      mailerService.sendAccountDeleted(email, disposition, {
        severed: reportsSevered,
        erased: reportsErased,
      }),
      "account deletion mail",
    );

    // Recount the reports this person had propped up. Deliberately after the
    // commit: the score is derived, so a failure here leaves it stale rather than
    // rolling back a deletion, and the nightly reconciliation catches the drift.
    const proppedUp = [...new Set(corroborations.map((row) => row.report_id))];
    runBackground(
      (async () => {
        for (const reportId of proppedUp) {
          const report = await Report.findByPk(reportId);
          if (report && !report.deleted_at) await reportService.refreshStrength(report);
        }
      })(),
      "account deletion strength recount",
    );

    logger.warn("[account] deleted", {
      emailHash: hashEmail(email).slice(0, 12),
      disposition,
      reportsSevered,
      reportsErased,
      commentsRemoved: comments.length,
    });

    return {
      disposition,
      reportsSevered,
      reportsErased,
      commentsRemoved: comments.length,
      supportsRemoved: supports.length,
      corroborationsRemoved: corroborations.length,
      filesPurgedAfter: reportsErased > 0 ? purgeAfter : null,
    };
  }

  /**
   * Bucket 2 — everything the person did on somebody else's report.
   *
   * Each removal carries its counter with it. Doing this with raw `destroy` calls
   * and fixing the counts afterwards would leave a window where D1's footer lies,
   * and this all runs inside the caller's transaction so there is no such window.
   *
   * Comments go first. Each one is a moderation target whose lock order is
   * comment → case → report counter (`moderation_case.service.ts`); taking them
   * before the support and corroboration counters on the same reports keeps this
   * transaction in that order too. Returns the flags resolved on their comments.
   */
  private async removeActivity(
    userId: string,
    rows: {
      supports: ReportSupport[];
      corroborations: ReportCorroboration[];
      comments: ReportComment[];
      likes: CommentLike[];
    },
    transaction: Transaction,
  ): Promise<ResolvedFlagRow[]> {
    const resolvedFlags: ResolvedFlagRow[] = [];

    /*
     * Comments become `removed` rather than disappearing, which is exactly what
     * `commentService.remove` already does when someone deletes their own comment.
     * The reason is threading: replies hang off a root comment, and hard-deleting a
     * root would take other people's replies with it. `removed` comments are
     * filtered out of every listing, so the words are gone from the product — this
     * is deletion of the content, not a tombstone the reader sees.
     *
     * `setCommentState` moves `comment_count` by what each comment actually
     * contributed (`visible AND approved`, §7.5), and each removed comment's
     * moderation work is withdrawn.
     */
    const commentIds = rows.comments.map((row) => row.id);
    for (const comment of rows.comments) {
      const change = await setCommentState(transaction, comment.id, { status: "removed" });
      if (change.before.status === "removed") continue;
      const closed = await moderationCaseService.closeForTarget(transaction, {
        targetType: "comment",
        targetId: comment.id,
        resolution: "withdrawn",
        flagOutcome: AUTHOR_REMOVED.outcome,
      });
      resolvedFlags.push(...closed.flags);
    }
    if (commentIds.length > 0) {
      await ReportComment.update(
        { body: "", anonymous: true },
        { where: { id: { [Op.in]: commentIds } }, transaction },
      );
      // Likes other people gave to their comments go with the comments.
      await CommentLike.destroy({
        where: { comment_id: { [Op.in]: commentIds } },
        transaction,
      });
      // And the AI's quotes of them (review R6) — see `redactModerationText`.
      await redactModerationText(transaction, { commentIds });
    }

    // Likes they gave.
    if (rows.likes.length > 0) {
      await CommentLike.destroy({ where: { user_id: userId }, transaction });
      for (const [commentId, count] of tally(rows.likes.map((r) => r.comment_id))) {
        await ReportComment.decrement("like_count", {
          by: count,
          where: { id: commentId },
          transaction,
        });
      }
    }

    // Supports.
    if (rows.supports.length > 0) {
      await ReportSupport.destroy({ where: { user_id: userId }, transaction });
      for (const [reportId, count] of tally(rows.supports.map((r) => r.report_id))) {
        await Report.decrement("support_count", {
          by: count,
          where: { id: reportId },
          transaction,
        });
      }
    }

    // Corroborations.
    if (rows.corroborations.length > 0) {
      await ReportCorroboration.destroy({ where: { user_id: userId }, transaction });
      for (const [reportId, count] of tally(rows.corroborations.map((r) => r.report_id))) {
        await Report.decrement("corroboration_count", {
          by: count,
          where: { id: reportId },
          transaction,
        });
      }
    }

    // Feed-hide choices are a preference, and the preference has no owner now.
    await ReportHide.destroy({ where: { user_id: userId }, transaction });
    return resolvedFlags;
  }
}

/**
 * Strip the member's words out of `moderation_runs` (review R6).
 *
 * Every assessed run stores `ai_summary` and, per category, an `evidence` quote
 * copied verbatim from the content plus its `evidenceEnglish` rendering. Nothing
 * else ever rewrote those columns, and runs are deleted only with their parent
 * report by the purge — so a comment on someone else's live report kept its
 * quotes (a phone number flagged as private info, say) forever after the
 * account was gone, breaking "the words are gone from the product" and
 * resurfacing in the case detail.
 *
 * Kept: the codes, violations, confidences and severities, so the audit of what
 * was decided and why still reads. Nulled: the summary and both quote fields
 * (set to null rather than dropped, so every stored verdict keeps the
 * `AiCategoryVerdict` shape). Scoped to the member's own content only: runs on
 * their comments, and report-target runs (content and evidence runs) on their
 * reports — never another member's comment on those reports.
 *
 * Call it only after the targets' own rows are locked by this transaction
 * (the comments' `setCommentState`, the reports' `Report.update`). A worker
 * locks the target first and writes its run's summary last, so the lock makes
 * the redaction wait for an in-flight worker and see what it wrote; a worker
 * that comes second finds the comment removed or the report deleted under its
 * lock and stores no text (review R4's lock order). A severed report stays
 * live, so a later run on it — a flag re-check — may quote its body again;
 * that body is still published record, which is why it was kept.
 */
export async function redactModerationText(
  transaction: Transaction,
  targets: { commentIds?: readonly string[]; reportIds?: readonly string[] },
): Promise<number> {
  const clauses: string[] = [];
  const replacements: Record<string, unknown> = {};
  if (targets.commentIds && targets.commentIds.length > 0) {
    clauses.push("(target_type = 'comment' AND comment_id IN (:commentIds))");
    replacements.commentIds = [...targets.commentIds];
  }
  if (targets.reportIds && targets.reportIds.length > 0) {
    clauses.push("(target_type = 'report' AND target_id IN (:reportIds))");
    replacements.reportIds = [...targets.reportIds];
  }
  if (clauses.length === 0) return 0;

  const [, result] = await sequelize.query(
    `UPDATE moderation_runs
        SET ai_summary = NULL,
            ai_categories = CASE
              WHEN jsonb_typeof(ai_categories) = 'array' THEN (
                SELECT COALESCE(
                         jsonb_agg(
                           CASE WHEN jsonb_typeof(c.verdict) = 'object'
                                THEN c.verdict || '{"evidence": null, "evidenceEnglish": null}'::jsonb
                                ELSE c.verdict END
                           ORDER BY c.pos),
                         '[]'::jsonb)
                  FROM jsonb_array_elements(ai_categories) WITH ORDINALITY AS c(verdict, pos))
              ELSE ai_categories END,
            updated_on = now()
      WHERE (${clauses.join(" OR ")})
        AND (ai_summary IS NOT NULL OR ai_categories IS NOT NULL)`,
    { replacements, transaction },
  );
  return typeof result === "number"
    ? result
    : Number((result as { rowCount?: number } | undefined)?.rowCount ?? 0);
}

/** Count occurrences, so one `decrement` per report replaces one per row. */
function tally(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export const accountDeletionService = new AccountDeletionService();
export default accountDeletionService;
