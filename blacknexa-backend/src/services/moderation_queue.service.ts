/**
 * The moderator's queue — `DERIVED`, and the reason the rest of the design works.
 *
 * Nothing in sections A–D shows who verifies a report, yet `Submitted → Under
 * review → Verified` drives the C9 stepper, the D2 timeline, the D1 badge, the D3
 * trust sheet, B2's "Verified only" filter and the first of A11's four
 * notifications. Without this service every report sits at `submitted` forever and
 * all of that is dead UI.
 *
 * ── Two rules with teeth ───────────────────────────────────────────────────
 *   • **Urgent first, on a clock.** C6 promises "a moderator sees it within the
 *     hour". The queue orders urgent ahead of everything else and reports how it is
 *     doing against that promise, so the promise is measurable rather than
 *     aspirational.
 *   • **A moderator cannot moderate their own report.** Verification is worth
 *     something only if the person doing it is not the person who filed it.
 */

import { Op } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report, ReportEvidence, ReportStatusEvent } from "@/models/report.model";
import { ReportComment, ReportFlag } from "@/models/report_social.model";
import { AppUser } from "@/models/app_user.model";
import reportService from "@/services/report.service";
import evidenceService from "@/services/evidence.service";
import notificationService from "@/services/notification.service";
import mailerService from "@/services/mailer.service";
import { badRequest, forbidden, notFound } from "@/middlewares/error.middleware";
import type { ModerationOutcome, ReportStatus } from "@/types/report.interface";

/** One row in the queue. Carries what a decision needs, not the whole report. */
export interface QueueRow {
  id: string;
  caseRef: string;
  title: string;
  category: string;
  status: ReportStatus;
  urgent: boolean;
  visibility: string;
  filedAt: string;
  evidenceCount: number;
  openFlags: number;
  /** Minutes since filing — measured against the urgent SLA. */
  waitingMinutes: number;
  /** True when an urgent report has already passed the SLA. */
  slaBreached: boolean;
}

export interface QueueFilters {
  status?: ReportStatus;
  urgent?: boolean;
  flagged?: boolean;
  cursor?: string;
  limit?: number;
}

class ModerationQueueService {
  /**
   * The queue.
   *
   * Ordered urgent-first, then oldest-first — a moderator should always be looking
   * at the thing that has been waiting longest inside the highest priority band,
   * not the newest arrival.
   */
  async queue(filters: QueueFilters): Promise<{ items: QueueRow[]; nextCursor: string | null }> {
    const limit = Math.min(filters.limit ?? 25, 100);
    const where: Record<string, unknown> = { deleted_at: null };

    // Default to everything still awaiting a decision.
    where.status = filters.status ?? { [Op.in]: ["submitted", "under_review"] };
    if (filters.urgent !== undefined) where.urgent = filters.urgent;
    if (filters.cursor) where.filed_at = { [Op.gt]: filters.cursor };

    if (filters.flagged) {
      const flagged = await ReportFlag.findAll({
        where: { status: "open", report_id: { [Op.ne]: null } },
        attributes: ["report_id"],
        group: ["report_id"],
      });
      const ids = flagged.map((row) => row.report_id).filter(Boolean) as string[];
      // An empty set has to mean "nothing", not "no filter".
      where.id = ids.length > 0 ? { [Op.in]: ids } : { [Op.in]: ["__none__"] };
    }

    const rows = await Report.findAll({
      where,
      order: [
        ["urgent", "DESC"],
        ["filed_at", "ASC"],
      ],
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    if (page.length === 0) return { items: [], nextCursor: null };

    const ids = page.map((row) => row.id);
    const [evidence, flags] = await Promise.all([
      ReportEvidence.findAll({ where: { report_id: { [Op.in]: ids } }, attributes: ["report_id"] }),
      ReportFlag.findAll({
        where: { report_id: { [Op.in]: ids }, status: "open" },
        attributes: ["report_id"],
      }),
    ]);

    const items = page.map((row) => {
      const waitingMinutes = Math.max(
        0,
        Math.round((Date.now() - Date.parse(row.filed_at)) / 60000),
      );
      return {
        id: row.id,
        caseRef: row.case_ref,
        title: row.title,
        category: row.category,
        status: row.status,
        urgent: row.urgent,
        visibility: row.visibility,
        filedAt: row.filed_at,
        evidenceCount: evidence.filter((item) => item.report_id === row.id).length,
        openFlags: flags.filter((item) => item.report_id === row.id).length,
        waitingMinutes,
        slaBreached: row.urgent && waitingMinutes > env.reports.urgentSlaMinutes,
      } satisfies QueueRow;
    });

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].filed_at : null,
    };
  }

  /**
   * Full detail for a decision, with the author's identity visible.
   *
   * This is the one projection that does not hide the owner: C9 promises
   * "Moderators can still see who filed it", and a report with no accountable
   * source cannot be verified.
   */
  async detail(reportId: string): Promise<{
    report: Awaited<ReturnType<typeof reportService.ownerView>>;
    /** Null when the account was deleted and the report kept as anonymous record. */
    author: { id: string; email: string; displayName: string; role: string } | null;
    flags: {
      flagRef: string;
      reason: string;
      note: string | null;
      status: string;
      createdAt: string;
    }[];
  }> {
    const report = await Report.findByPk(reportId);
    if (!report) throw notFound("That report does not exist.");

    const [view, owner, flags] = await Promise.all([
      reportService.ownerView(report),
      report.user_id ? AppUser.findByPk(report.user_id) : Promise.resolve(null),
      ReportFlag.findAll({
        where: { report_id: reportId },
        order: [["created_at", "DESC"]],
      }),
    ]);

    return {
      report: view,
      /*
       * Null rather than a placeholder when the author is gone. A moderator seeing
       * an empty-string name would reasonably read it as a data problem; seeing no
       * author at all tells them the truth — this report has been severed from its
       * account and there is no one to follow up with.
       */
      author: owner
        ? {
            id: owner.id,
            email: owner.email,
            displayName: owner.display_name ?? "",
            role: owner.role,
          }
        : null,
      // The reporter's identity is deliberately absent: D9 promises the author is
      // told nothing about who flagged them, and a moderator does not need it to
      // judge the content.
      flags: flags.map((flag) => ({
        flagRef: flag.flag_ref,
        reason: flag.reason,
        note: flag.note,
        status: flag.status,
        createdAt: flag.created_at,
      })),
    };
  }

  /** Presigned read for a single file, so evidence can actually be reviewed. */
  async evidenceUrl(reportId: string, evidenceId: string): Promise<string | null> {
    const row = await ReportEvidence.findOne({
      where: { id: evidenceId, report_id: reportId },
    });
    if (!row) return null;
    const view = await evidenceService.toView(row);
    return view.url;
  }

  /**
   * Record a decision.
   *
   * Delegates the transition to `reportService`, which writes the status event and
   * the owner's notification in one transaction — so a decision cannot land without
   * the timeline and B3 both reflecting it.
   */
  async decide(
    reportId: string,
    outcome: ModerationOutcome,
    moderator: { id: string; email: string },
    note?: string,
  ): Promise<void> {
    const report = await Report.findByPk(reportId);
    if (!report) throw notFound("That report does not exist.");

    // Verification means nothing if it can be self-issued.
    if (report.user_id === moderator.id) {
      throw forbidden("You cannot moderate your own report.");
    }

    await reportService.transition(report, outcome, { kind: "moderator", id: moderator.id }, note);

    logger.info("[moderation] decision recorded", {
      reportId,
      caseRef: report.case_ref,
      outcome,
      moderator: moderator.email,
    });
  }

  /**
   * Resolve a flag.
   *
   * D9 promises "You will hear back: By email", so resolving one sends that mail —
   * to the person who flagged, never to the author.
   */
  async resolveFlag(
    flagId: string,
    resolution: string,
    outcome: "resolved" | "dismissed",
    moderator: { id: string },
  ): Promise<void> {
    const flag = await ReportFlag.findByPk(flagId);
    if (!flag) throw notFound("That flag does not exist.");
    if (flag.status !== "open") throw badRequest("That flag has already been handled.");

    await flag.update({
      status: outcome,
      resolution,
      resolved_at: nowIso(),
    });

    // No reporter means they deleted their account after flagging. The flag is
    // still resolved — there is just nobody left to write back to.
    const reporter = flag.reporter_id ? await AppUser.findByPk(flag.reporter_id) : null;
    if (reporter?.email) {
      await mailerService.sendFlagOutcome(
        reporter.email,
        flag.flag_ref,
        outcome === "resolved" ? "Action taken" : "No action needed",
        resolution,
      );
    }

    logger.info("[moderation] flag resolved", { flagRef: flag.flag_ref, outcome });
  }

  /** Hide a comment. The report's count follows so D1's footer stays true. */
  async hideComment(commentId: string): Promise<void> {
    const comment = await ReportComment.findByPk(commentId);
    if (!comment) throw notFound("That comment does not exist.");
    if (comment.status === "hidden") return;

    const report = await Report.findByPk(comment.report_id);
    await sequelize.transaction(async (transaction) => {
      await comment.update({ status: "hidden" }, { transaction });
      if (report) await report.decrement("comment_count", { by: 1, transaction });
    });
  }

  /**
   * A11's fourth notification type — an area broadcast.
   *
   * Bypasses every recipient's notification preference, because the screen promises
   * it will: "Rare, and for your area only. These cannot be turned off."
   */
  async broadcast(area: string, title: string, body: string): Promise<{ recipients: number }> {
    return notificationService.broadcastUrgent(area, title, body);
  }

  /**
   * How the queue is doing against C6's one-hour promise.
   *
   * Reported rather than assumed: a promise printed on a user-facing screen should
   * be something an operator can check.
   */
  async stats(): Promise<{
    open: number;
    urgentOpen: number;
    urgentBreached: number;
    slaMinutes: number;
    openFlags: number;
    oldestWaitingMinutes: number;
  }> {
    const [open, urgentRows, openFlags] = await Promise.all([
      Report.count({ where: { status: { [Op.in]: ["submitted", "under_review"] }, deleted_at: null } }),
      Report.findAll({
        where: {
          status: { [Op.in]: ["submitted", "under_review"] },
          urgent: true,
          deleted_at: null,
        },
        attributes: ["filed_at"],
      }),
      ReportFlag.count({ where: { status: "open" } }),
    ]);

    const now = Date.now();
    const waits = urgentRows.map((row) =>
      Math.round((now - Date.parse(row.filed_at)) / 60000),
    );

    return {
      open,
      urgentOpen: urgentRows.length,
      urgentBreached: waits.filter((minutes) => minutes > env.reports.urgentSlaMinutes).length,
      slaMinutes: env.reports.urgentSlaMinutes,
      openFlags,
      oldestWaitingMinutes: waits.length > 0 ? Math.max(...waits) : 0,
    };
  }
}

export const moderationQueueService = new ModerationQueueService();
export default moderationQueueService;
