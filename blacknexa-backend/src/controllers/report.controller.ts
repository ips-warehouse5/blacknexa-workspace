/**
 * Report controller — `/api/v1/reports`, `/api/v1/comments`, `/api/v1/notifications`.
 *
 * ── The read-access rule ───────────────────────────────────────────────────
 * A report the caller may not read returns **404, not 403**. A 403 confirms the
 * report exists, and for a private or Trusted-Circle report that confirmation is
 * itself the disclosure. So `load()` collapses "absent" and "not yours" into one
 * answer.
 */

import type { Request, Response } from "express";
import env from "@/config/env.config";
import reportService from "@/services/report.service";
import reportFeedService from "@/services/report_feed.service";
import evidenceService from "@/services/evidence.service";
import commentService from "@/services/comment.service";
import notificationService from "@/services/notification.service";
import { Report, nextFlagRef } from "@/models/report.model";
import { ReportFlag } from "@/models/report_social.model";
import { nowIso } from "@/models/model_options";
import { responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import { forbidden, notFound } from "@/middlewares/error.middleware";
import type {
  CommitEvidenceDto,
  CreateCommentDto,
  CreateFlagDto,
  FeedQuery,
  FileReportDto,
  PresignEvidenceDto,
  SaveDraftDto,
} from "@/types/report.interface";

/** The caller, as the guards leave it. */
function viewer(req: Request): { id: string | null; role: string | null } {
  return req.user
    ? { id: req.user.id, role: req.user.role as string }
    : { id: null, role: null };
}

class ReportController {
  /**
   * Load a report the caller is allowed to read, or 404.
   *
   * Never returns 403 — see the file header.
   */
  private async load(req: Request): Promise<Report> {
    const { id } = validatedParams<{ id: string }>(req);
    const report = await reportService.findByIdOrRef(decodeURIComponent(id));
    const who = viewer(req);
    if (!report || !reportService.canRead(report, who.id, who.role)) {
      throw notFound("That report is not available.");
    }
    return report;
  }

  /** Load a report the caller owns, or 404/403 as appropriate. */
  private async loadOwned(req: Request): Promise<Report> {
    const report = await this.load(req);
    if (report.user_id !== req.user!.id) {
      // The caller can already see it, so acknowledging it exists costs nothing —
      // this 403 is about the action, not about existence.
      throw forbidden("That is not your report.");
    }
    return report;
  }

  // ── Drafts (C1–C7, C10) ───────────────────────────────────────────────────

  /** `POST /reports/drafts` — the wizard's autosave. */
  async saveDraft(req: Request, res: Response): Promise<void> {
    const body = validatedBody<SaveDraftDto>(req);
    const result = await reportService.saveDraft(
      req.user!.id,
      body.draftId,
      body.step,
      body.payload,
    );
    responseData({ res, message: "Draft saved.", result });
  }

  /** `GET /reports/drafts` — the Vault's resume list. */
  async listDrafts(req: Request, res: Response): Promise<void> {
    const drafts = await reportService.listDrafts(req.user!.id);
    responseData({ res, message: responseMessage("success", "list", "Draft"), result: drafts });
  }

  /** `GET /reports/drafts/:id/evidence` — C5's attached list. */
  async draftEvidence(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const evidence = await evidenceService.listForDraft(id);
    responseData({ res, message: responseMessage("success", "list", "Evidence"), result: evidence });
  }

  /** `DELETE /reports/drafts/:id` — C11's discard. */
  async discardDraft(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const removed = await reportService.discardDraft(req.user!.id, id);
    if (!removed) throw notFound("That draft no longer exists.");
    responseData({ res, message: "Draft discarded.", result: null });
  }

  // ── Filing (C7 → C9) ──────────────────────────────────────────────────────

  /** `POST /reports` — file a draft. */
  async file(req: Request, res: Response): Promise<void> {
    const body = validatedBody<FileReportDto>(req);
    const result = await reportService.fileReport(req.user!.id, body.draftId, body.attested);
    responseData({
      res,
      status: 201,
      // C9's own words, so the receipt and the API agree.
      message: "Your report is filed.",
      result,
    });
  }

  // ── Evidence (C5) ─────────────────────────────────────────────────────────

  /** `POST /reports/evidence/presign` */
  async presignEvidence(req: Request, res: Response): Promise<void> {
    const body = validatedBody<PresignEvidenceDto & { draftId?: string; reportId?: string }>(req);
    const result = await evidenceService.presign(
      req.user!.id,
      { draftId: body.draftId, reportId: body.reportId },
      body,
    );
    responseData({ res, status: 201, message: "Ready to upload.", result });
  }

  /** `POST /reports/evidence/:id/commit` — where sealing happens. */
  async commitEvidence(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<CommitEvidenceDto>(req);
    const result = await evidenceService.commit(req.user!.id, id, body);
    responseData({ res, message: "File sealed.", result });
  }

  /** `DELETE /reports/evidence/:id` — only before the report is filed. */
  async removeEvidence(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const removed = await evidenceService.remove(req.user!.id, id);
    if (!removed) throw notFound("That file is not attached to anything.");
    responseData({ res, message: "File removed.", result: null });
  }

  // ── Feed (B1–B7) ──────────────────────────────────────────────────────────

  /** `GET /reports` */
  async feed(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<FeedQuery>(req);
    const result = await reportFeedService.page(query, viewer(req));
    responseData({ res, message: responseMessage("success", "list", "Report"), result });
  }

  /** `GET /reports/facets` — B1's chip counts and B2's live counts. */
  async facets(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<FeedQuery>(req);
    const result = await reportFeedService.facets(query, viewer(req));
    responseData({ res, message: responseMessage("success", "fetch", "Counts"), result });
  }

  /** `GET /reports/search` — B5, and B6's suggestion. */
  async search(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<FeedQuery & { q: string }>(req);
    const result = await reportFeedService.search(query.q, query, viewer(req));
    responseData({ res, message: responseMessage("success", "list", "Result"), result });
  }

  // ── Detail (D1–D3) ────────────────────────────────────────────────────────

  /**
   * `GET /reports/:id`
   *
   * The owner gets the D2 projection and everyone else gets D1 — a separate
   * screen, not a variant, which is why they are separate shapes rather than one
   * shape with nulls.
   */
  async detail(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const who = viewer(req);

    if (who.id && who.id === report.user_id) {
      const result = await reportService.ownerView(report);
      responseData({ res, message: responseMessage("success", "fetch", "Report"), result });
      return;
    }

    await reportService.recordView(report, who.id);
    const result = await reportService.detailView(report, who.id);
    responseData({ res, message: responseMessage("success", "fetch", "Report"), result });
  }

  /** `GET /reports/:id/trust` — D3. */
  async trust(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const result = await reportService.trustView(report);
    responseData({ res, message: responseMessage("success", "fetch", "Trust"), result });
  }

  /** `PATCH /reports/:id` — D2's edit. Title and body only. */
  async update(req: Request, res: Response): Promise<void> {
    const report = await this.loadOwned(req);
    const body = validatedBody<{ title?: string; body?: string }>(req);
    await reportService.updateReport(report, body);
    await report.reload();
    const result = await reportService.ownerView(report);
    responseData({ res, message: responseMessage("success", "update", "Report"), result });
  }

  /** `DELETE /reports/:id` — D2's delete, with the 30-day evidence window. */
  async remove(req: Request, res: Response): Promise<void> {
    const report = await this.loadOwned(req);
    await reportService.deleteReport(report);
    responseData({
      res,
      // D2's own copy, so the confirmation matches what the button promised.
      message:
        "Removed from the feed and from your Vault. Sealed files are destroyed after 30 days.",
      result: { reportId: report.id },
    });
  }

  // ── Social (D1, D8–D10) ───────────────────────────────────────────────────

  /** `POST /reports/:id/support` — D1's "Stand with". */
  async support(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const result = await reportService.toggleSupport(report, req.user!.id);
    responseData({ res, message: "Updated.", result });
  }

  /** `POST /reports/:id/corroborate` */
  async corroborate(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const { note } = validatedBody<{ note?: string }>(req);
    const result = await reportService.corroborate(report, req.user!.id, note);
    responseData({ res, message: "Thank you — that has been recorded.", result });
  }

  /**
   * `POST /reports/:id/flags` — D8 → D9.
   *
   * The reference comes back so D9 can print it, and the response repeats what the
   * author is told, because that is the reassurance the screen exists to give.
   */
  async flag(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const body = validatedBody<CreateFlagDto>(req);

    const flagRef = await nextFlagRef();
    await ReportFlag.create({
      flag_ref: flagRef,
      report_id: report.id,
      reporter_id: req.user!.id,
      reason: body.reason,
      note: body.note ?? null,
      created_at: nowIso(),
    });

    responseData({
      res,
      status: 201,
      message: "Thank you — a moderator will look.",
      result: {
        flagRef,
        authorIsTold: "Nothing about you",
        // D9: most within a day, a safety flag within the hour.
        expectedWithin:
          body.reason === "threatening" ? "within the hour" : "within a day",
      },
    });
  }

  /** `POST /comments/:id/flags` — the same sheet, three reasons. */
  async flagComment(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<CreateFlagDto>(req);

    const flagRef = await nextFlagRef();
    await ReportFlag.create({
      flag_ref: flagRef,
      comment_id: id,
      reporter_id: req.user!.id,
      reason: body.reason,
      note: body.note ?? null,
      created_at: nowIso(),
    });

    responseData({
      res,
      status: 201,
      message: "Thank you — a moderator will look.",
      result: { flagRef, authorIsTold: "Nothing about you" },
    });
  }

  /** `POST /reports/:id/hide` — D9's offer, never assumed. */
  async hide(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    await reportService.hideFromFeed(report.id, req.user!.id);
    responseData({ res, message: "Hidden from your feed.", result: null });
  }

  /** `POST /reports/:id/share-link` — D10. */
  async shareLink(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const token = await reportService.createShareToken(report, req.user!.id);
    responseData({
      res,
      status: 201,
      message: "Link ready.",
      result: {
        // Through the config, not `process.env`: the origin has a validated default
        // there, and a share link that renders as `/r/BNX-4471` with no host is a
        // link nobody can open.
        url: `${env.publicSiteOrigin}/r/${report.case_ref}?t=${token}`,
        caseRef: report.case_ref,
        // D10's "what a recipient sees" card, stated by the API too so the client
        // cannot drift from the promise.
        recipientSees: {
          authorName: false,
          exactLocation: false,
          thatYouShared: false,
        },
      },
    });
  }

  // ── Comments (D4–D7) ──────────────────────────────────────────────────────

  /** `GET /reports/:id/comments` */
  async comments(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const query = validatedQuery<{ sort?: "top" | "new"; cursor?: string }>(req);
    const result = await commentService.list(
      report.id,
      viewer(req).id,
      query.sort ?? "top",
      query.cursor,
    );
    responseData({ res, message: responseMessage("success", "list", "Comment"), result });
  }

  /** `POST /reports/:id/comments` */
  async createComment(req: Request, res: Response): Promise<void> {
    const report = await this.load(req);
    const body = validatedBody<CreateCommentDto>(req);
    const result = await commentService.create(
      report,
      req.user!.id,
      body.body,
      body.parentId,
      body.anonymous ?? false,
    );
    responseData({ res, status: 201, message: "Posted.", result });
  }

  /** `POST /comments/:id/like` */
  async likeComment(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await commentService.toggleLike(id, req.user!.id);
    responseData({ res, message: "Updated.", result });
  }

  /** `DELETE /comments/:id` */
  async removeComment(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    await commentService.remove(id, req.user!.id);
    responseData({ res, message: "Comment removed.", result: null });
  }

  // ── Notifications (B3) ────────────────────────────────────────────────────

  /** `GET /notifications` */
  async notifications(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{ cursor?: string; limit?: number }>(req);
    const result = await notificationService.list(req.user!.id, query.cursor, query.limit);
    responseData({ res, message: responseMessage("success", "list", "Notification"), result });
  }

  /** `POST /notifications/read-all` — B3's "Mark all read". */
  async markAllRead(req: Request, res: Response): Promise<void> {
    const count = await notificationService.markAllRead(req.user!.id);
    responseData({ res, message: "All caught up.", result: { updated: count } });
  }
}

export const reportController = new ReportController();
export default reportController;
