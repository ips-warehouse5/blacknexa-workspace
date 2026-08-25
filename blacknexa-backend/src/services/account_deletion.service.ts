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

    const visibleComments = comments.filter((row) => row.status === "visible");

    let reportsSevered = 0;
    let reportsErased = 0;

    await sequelize.transaction(async (transaction) => {
      // ── 2. Their activity on other people's reports ──────────────────────
      await this.removeActivity(
        userId,
        { supports, corroborations, comments, visibleComments, likes },
        transaction,
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
          reportsErased = ownedIds.length;
        }
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
   */
  private async removeActivity(
    userId: string,
    rows: {
      supports: ReportSupport[];
      corroborations: ReportCorroboration[];
      comments: ReportComment[];
      visibleComments: ReportComment[];
      likes: CommentLike[];
    },
    transaction: Transaction,
  ): Promise<void> {
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

    // Likes other people gave to their comments go with the comments.
    const commentIds = rows.comments.map((row) => row.id);
    if (commentIds.length > 0) {
      await CommentLike.destroy({
        where: { comment_id: { [Op.in]: commentIds } },
        transaction,
      });
    }

    /*
     * Comments become `removed` rather than disappearing, which is exactly what
     * `commentService.remove` already does when someone deletes their own comment.
     * The reason is threading: replies hang off a root comment, and hard-deleting a
     * root would take other people's replies with it. `removed` comments are
     * filtered out of every listing, so the words are gone from the product — this
     * is deletion of the content, not a tombstone the reader sees.
     */
    if (commentIds.length > 0) {
      await ReportComment.update(
        { status: "removed", body: "", anonymous: true },
        { where: { id: { [Op.in]: commentIds } }, transaction },
      );
      for (const [reportId, count] of tally(rows.visibleComments.map((r) => r.report_id))) {
        await Report.decrement("comment_count", {
          by: count,
          where: { id: reportId },
          transaction,
        });
      }
    }

    // Feed-hide choices are a preference, and the preference has no owner now.
    await ReportHide.destroy({ where: { user_id: userId }, transaction });
  }
}

/** Count occurrences, so one `decrement` per report replaces one per row. */
function tally(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export const accountDeletionService = new AccountDeletionService();
export default accountDeletionService;
