/**
 * Nightly report maintenance. `DERIVED`, and it is what makes two of the app's
 * promises real rather than decorative.
 *
 * ── 1. The purge ───────────────────────────────────────────────────────────
 * D2 tells the owner "sealed files are destroyed after 30 days", and the delete
 * path writes a `purge_after` date on every evidence row it retires. Nothing
 * currently reads that column, which means the sentence is a plan rather than a
 * fact. This job reads it.
 *
 * The order matters: **the object goes first, then the row**. A row deleted before
 * its object leaves a file in the bucket nothing points at — unreachable through the
 * API and invisible to every later run of this job, so it lives forever. The reverse
 * is a row whose object is already gone, which the next run simply cleans up.
 *
 * ── 2. The reconciliation ──────────────────────────────────────────────────
 * `support_count`, `comment_count` and `corroboration_count` are denormalised so a
 * feed card is one row rather than four aggregates. Every writer keeps them in a
 * transaction with the row it counts, so they should never drift — but "should never"
 * is not a guarantee, and a wrong count on D1 is the kind of small wrongness that
 * makes a person doubt the rest of the record. So they are recounted nightly and any
 * drift is corrected and logged loudly enough to investigate.
 *
 * Drift is logged as a warning even though it is repaired, because a count that
 * needed repairing means a writer somewhere is not doing what it claims.
 *
 * ── 3. Expired one-time codes and dead sessions ────────────────────────────
 * Neither is a security hole — both are checked on use — but an `email_otps` table
 * that only grows is a table nobody wants to read during an incident.
 */

import { Op, fn, col } from "sequelize";
import type { Model, ModelStatic, WhereOptions } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { Report, ReportEvidence } from "@/models/report.model";
import {
  ReportComment,
  ReportCorroboration,
  ReportSupport,
} from "@/models/report_social.model";
import { EmailOtp, UserSession } from "@/models/app_user.model";
import s3Service from "@/services/s3.service";

/** How long a revoked session row is kept before it is dropped. */
const REVOKED_SESSION_RETENTION_DAYS = 30;

export interface MaintenanceResult {
  filesPurged: number;
  filesFailed: number;
  reportsPurged: number;
  countsCorrected: number;
  otpsRemoved: number;
  sessionsRemoved: number;
}

class ReportMaintenanceService {
  async run(): Promise<MaintenanceResult> {
    /*
     * Sequential on purpose, and in this order. `purgeDeletedReports` refuses to
     * hard-delete a report while any of its evidence is still in the bucket, so the
     * file purge has to have already run this tick or every report defers a day.
     */
    const purge = await this.purgeExpiredEvidence();
    const reportsPurged = await this.purgeDeletedReports();
    const countsCorrected = await this.reconcileCounters();
    const otpsRemoved = await this.pruneExpiredCodes();
    const sessionsRemoved = await this.pruneRevokedSessions();

    const result: MaintenanceResult = {
      filesPurged: purge.purged,
      filesFailed: purge.failed,
      reportsPurged,
      countsCorrected,
      otpsRemoved,
      sessionsRemoved,
    };

    logger.info("[reports] nightly maintenance finished", result);
    return result;
  }

  /**
   * Destroy sealed files whose retention window has closed.
   *
   * Batched rather than unbounded: the first run after this ships could have a
   * backlog, and a single job tick should not try to delete every object in it.
   */
  async purgeExpiredEvidence(batchSize = 500): Promise<{ purged: number; failed: number }> {
    const now = new Date().toISOString();
    const due = await ReportEvidence.findAll({
      where: { purge_after: { [Op.ne]: null, [Op.lte]: now } },
      limit: batchSize,
      order: [["purge_after", "ASC"]],
    });

    if (due.length === 0) return { purged: 0, failed: 0 };

    let purged = 0;
    let failed = 0;

    for (const row of due) {
      try {
        // Object first. See the header for why the order is not interchangeable.
        if (row.storage_key) await s3Service.deleteObject(row.storage_key);
        if (row.thumb_key) await s3Service.deleteObject(row.thumb_key);
        await row.destroy({ force: true });
        purged += 1;
      } catch (err) {
        /*
         * Left in place deliberately. `purge_after` is in the past, so the next run
         * picks it up again — a transient bucket error costs a day, not a file that
         * silently stays forever.
         */
        failed += 1;
        logger.warn("[reports] evidence purge failed, will retry tomorrow", {
          evidenceId: row.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[reports] evidence purge", {
      due: due.length,
      purged,
      failed,
      retentionDays: env.reports.evidenceRetentionDays,
    });
    return { purged, failed };
  }

  /**
   * Recount the three denormalised counters and correct any that drifted.
   *
   * One grouped query per counter, then a single update per report that is actually
   * wrong. Reports with a correct count are not written to at all, so a clean night
   * costs three reads.
   */
  async reconcileCounters(): Promise<number> {
    const [supports, corroborations, comments] = await Promise.all([
      this.tally(ReportSupport, {}),
      this.tally(ReportCorroboration, {}),
      // Hidden and removed comments are excluded, matching what `commentService`
      // counts when it increments — the footer says how many are readable.
      this.tally(ReportComment, { status: "visible" }),
    ]);

    const reports = await Report.findAll({
      where: { deleted_at: null },
      attributes: ["id", "case_ref", "support_count", "corroboration_count", "comment_count"],
    });

    let corrected = 0;

    for (const report of reports) {
      const actual = {
        support_count: supports.get(report.id) ?? 0,
        corroboration_count: corroborations.get(report.id) ?? 0,
        comment_count: comments.get(report.id) ?? 0,
      };

      const drift: Record<string, { stored: number; actual: number }> = {};
      if (report.support_count !== actual.support_count) {
        drift.support = { stored: report.support_count, actual: actual.support_count };
      }
      if (report.corroboration_count !== actual.corroboration_count) {
        drift.corroboration = {
          stored: report.corroboration_count,
          actual: actual.corroboration_count,
        };
      }
      if (report.comment_count !== actual.comment_count) {
        drift.comment = { stored: report.comment_count, actual: actual.comment_count };
      }

      if (Object.keys(drift).length === 0) continue;

      await report.update(actual);
      corrected += 1;

      // A warning, not an info line: a repaired count means a writer is wrong.
      logger.warn("[reports] counter drift corrected", {
        caseRef: report.case_ref,
        drift,
      });
    }

    return corrected;
  }

  /** `SELECT report_id, COUNT(*) … GROUP BY report_id` as a map. */
  private async tally(
    // `ModelStatic<Model>` rather than a union of the three classes: a union of
    // model constructors does not unify into a callable `findAll`, because each
    // one's creation attributes differ.
    model: ModelStatic<Model>,
    where: WhereOptions,
  ): Promise<Map<string, number>> {
    const rows = (await model.findAll({
      where,
      attributes: ["report_id", [fn("COUNT", col("id")), "total"]],
      group: ["report_id"],
      raw: true,
    })) as unknown as { report_id: string; total: string | number }[];

    return new Map(rows.map((row) => [row.report_id, Number(row.total)]));
  }

  /**
   * Drop one-time codes that can no longer be used.
   *
   * Consumed or expired, and older than a day — the day of slack is so a support
   * question about "I used the code and it said no" can still be answered from the
   * row rather than from a guess.
   */
  async pruneExpiredCodes(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return EmailOtp.destroy({
      where: {
        [Op.or]: [{ consumed_at: { [Op.ne]: null } }, { expires_at: { [Op.lt]: cutoff } }],
        sent_at: { [Op.lt]: cutoff },
      },
    });
  }

  /**
   * Drop long-revoked sessions.
   *
   * A15 lists devices, and a revoked row is not a device — but it is kept for a
   * month first, because "when was I signed out of that phone?" is a question
   * someone worried about their account will actually ask.
   */
  async pruneRevokedSessions(): Promise<number> {
    const cutoff = new Date(
      Date.now() - REVOKED_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    return UserSession.destroy({
      where: { revoked_at: { [Op.ne]: null, [Op.lt]: cutoff } },
    });
  }

  /**
   * Reports soft-deleted long enough ago that their evidence is already gone.
   *
   * Called after the purge, so a report is only hard-deleted once nothing points at
   * a file that still exists. Children go with it — comments and corroborations on a
   * report that no longer exists are unreachable by any route.
   */
  async purgeDeletedReports(): Promise<number> {
    const cutoff = new Date(
      Date.now() - env.reports.evidenceRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const due = await Report.findAll({
      where: { deleted_at: { [Op.ne]: null, [Op.lt]: cutoff } },
      attributes: ["id", "case_ref"],
      limit: 200,
    });
    if (due.length === 0) return 0;

    const ids = due.map((row) => row.id);

    // Refuse to hard-delete while any file is still in the bucket. Better a report
    // that lingers a day than an orphaned object nothing will ever collect.
    const remaining = await ReportEvidence.count({ where: { report_id: { [Op.in]: ids } } });
    if (remaining > 0) {
      logger.info("[reports] deferring report purge — evidence still present", {
        reports: due.length,
        evidenceRows: remaining,
      });
      return 0;
    }

    await sequelize.transaction(async (transaction) => {
      await ReportSupport.destroy({ where: { report_id: { [Op.in]: ids } }, transaction });
      await ReportCorroboration.destroy({ where: { report_id: { [Op.in]: ids } }, transaction });
      await ReportComment.destroy({ where: { report_id: { [Op.in]: ids } }, transaction });
      await Report.destroy({ where: { id: { [Op.in]: ids } }, force: true, transaction });
    });

    logger.info("[reports] deleted reports purged", { count: due.length });
    return due.length;
  }
}

export const reportMaintenanceService = new ReportMaintenanceService();
export default reportMaintenanceService;
