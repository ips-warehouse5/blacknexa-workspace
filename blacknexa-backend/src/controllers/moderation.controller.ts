/**
 * Content Moderation controller — `/api/v1/admin/moderation`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §8.1. Thin by design, like the contact and staff
 * controllers: every rule — who may decide, what a decision writes, what is
 * refused — lives in `moderation_admin.service.ts` and `keyword_rules.service.ts`,
 * so a second entry point cannot skip one by not coming through here. This
 * layer reads the validated request, names the acting operator, and shapes the
 * envelope: `responseData` everywhere, and for lists `result: T[]` plus a
 * top-level `pagination` block (`buildPagination`), which is what the console's
 * `apiGetPage` expects. The contract is written out in
 * `docs/ADMIN_MODERATION_API.md`.
 *
 * The server-rendered HTML queue this controller used to serve is gone: the
 * console is the moderation surface now, and every number that page showed has
 * a JSON endpoint behind it.
 */

import type { Request, Response } from "express";
import moderationAdminService, {
  type CaseListQuery,
  type CaseSort,
} from "@/services/moderation_admin.service";
import keywordRulesService from "@/services/keyword_rules.service";
import reportMaintenanceService from "@/services/report_maintenance.service";
import type { AdminActor } from "@/services/admin_guard.service";
import { buildPagination, responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import type {
  CaseState,
  KeywordAction,
  KeywordAppliesTo,
  ModerationQueueTab,
  ModerationTargetType,
  PolicyCategory,
  RejectReasonCode,
} from "@/types/moderation.interface";

/**
 * The acting operator. Present because the router runs `adminAuthGuard` first;
 * the fallbacks make a mis-ordered stack fail as an unattributed, permission-
 * less actor rather than a crash.
 */
function actor(req: Request): AdminActor {
  return {
    id: req.user?.id ?? "",
    email: req.user?.email ?? "",
    role: req.user?.role ?? "",
    ip: req.ip ?? null,
  };
}

class ModerationController {
  // ── Queue ───────────────────────────────────────────────────────────────

  /** `GET /cases` */
  async listCases(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      page: number;
      limit: number;
      tab: ModerationQueueTab;
      state: CaseState;
      targetType?: ModerationTargetType;
      urgent?: boolean;
      search?: string;
      sort: CaseSort;
    }>(req);

    const params: CaseListQuery = {
      page: query.page,
      limit: query.limit,
      tab: query.tab,
      state: query.state,
      sort: query.sort,
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(typeof query.urgent === "boolean" ? { urgent: query.urgent } : {}),
      ...(query.search ? { search: query.search } : {}),
    };
    const { items, total } = await moderationAdminService.listCases(params);
    responseData({
      res,
      message: responseMessage("success", "list", "Moderation cases"),
      result: items,
      pagination: buildPagination(query.page, query.limit, total),
    });
  }

  /** `GET /cases/summary` */
  async caseSummary(_req: Request, res: Response): Promise<void> {
    const result = await moderationAdminService.caseSummary();
    responseData({ res, message: responseMessage("success", "fetch", "Moderation summary"), result });
  }

  /** `GET /cases/:id` */
  async caseDetail(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await moderationAdminService.caseDetail(id);
    responseData({ res, message: responseMessage("success", "fetch", "Moderation case"), result });
  }

  /** `GET /cases/:id/evidence/:evidenceId` */
  async caseEvidence(req: Request, res: Response): Promise<void> {
    const { id, evidenceId } = validatedParams<{ id: string; evidenceId: string }>(req);
    const result = await moderationAdminService.caseEvidenceUrl(id, evidenceId);
    responseData({ res, message: "Link ready.", result });
  }

  // ── Decisions ───────────────────────────────────────────────────────────

  /** `POST /cases/:id/approve` */
  async approve(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ internalNote?: string; contentVersion?: number; evidenceIds?: string[] }>(req);
    const result = await moderationAdminService.approveCase(actor(req), id, body);
    responseData({
      res,
      message: result.targetType === "comment" ? "Comment kept." : "Approved and published.",
      result,
    });
  }

  /** `POST /cases/:id/reject` */
  async reject(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{
      reasonCode: RejectReasonCode;
      publicNote?: string;
      internalNote?: string;
      contentVersion?: number;
    }>(req);
    const result = await moderationAdminService.rejectCase(actor(req), id, body);
    responseData({
      res,
      message: result.targetType === "comment" ? "Comment removed." : "Rejected. The author has been told why.",
      result,
    });
  }

  /** `POST /cases/:id/evidence/:evidenceId/reject` */
  async rejectEvidence(req: Request, res: Response): Promise<void> {
    const { id, evidenceId } = validatedParams<{ id: string; evidenceId: string }>(req);
    const body = validatedBody<{ reasonCode?: RejectReasonCode; internalNote?: string }>(req);
    const result = await moderationAdminService.rejectEvidence(actor(req), id, evidenceId, body);
    responseData({ res, message: "The file is hidden from members.", result });
  }

  /** `POST /cases/:id/rerun` */
  async rerun(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await moderationAdminService.rerunCase(actor(req), id);
    responseData({ res, message: "Sent back through the AI check.", result });
  }

  // ── Members ─────────────────────────────────────────────────────────────

  /** `POST /members/:id/ban` */
  async ban(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ reasonCode: string; note?: string; caseId?: string }>(req);
    const result = await moderationAdminService.banMember(actor(req), id, body);
    responseData({ res, message: "Member banned. Every session they had has been signed out.", result });
  }

  /** `POST /members/:id/unban` */
  async unban(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ note?: string; caseId?: string }>(req);
    const result = await moderationAdminService.unbanMember(actor(req), id, body);
    responseData({ res, message: "Ban lifted. The member can sign in again.", result });
  }

  // ── Keyword rules ───────────────────────────────────────────────────────

  /** `GET /keyword-rules` */
  async listRules(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      page: number;
      limit: number;
      search?: string;
      action?: KeywordAction;
      enabled?: boolean;
      category?: PolicyCategory;
      appliesTo?: KeywordAppliesTo;
    }>(req);
    const { items, total, page, limit } = await keywordRulesService.listRules({
      page: query.page,
      limit: query.limit,
      ...(query.search ? { search: query.search } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(typeof query.enabled === "boolean" ? { enabled: query.enabled } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.appliesTo ? { appliesTo: query.appliesTo } : {}),
    });
    responseData({
      res,
      message: responseMessage("success", "list", "Keyword rules"),
      result: items,
      pagination: buildPagination(page, limit, total),
    });
  }

  /** `GET /keyword-rules/:id` */
  async getRule(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await keywordRulesService.getRule(id);
    responseData({ res, message: responseMessage("success", "fetch", "Keyword rule"), result });
  }

  /** `POST /keyword-rules` */
  async createRule(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      name: string;
      category: PolicyCategory;
      terms: string[];
      action?: KeywordAction;
      appliesTo?: KeywordAppliesTo;
      enabled?: boolean;
    }>(req);
    const who = actor(req);
    const result = await keywordRulesService.createRule(body, { adminId: who.id, ip: who.ip });
    responseData({ res, status: 201, message: responseMessage("success", "create", "Keyword rule"), result });
  }

  /** `PATCH /keyword-rules/:id` */
  async updateRule(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{
      name?: string;
      category?: PolicyCategory;
      terms?: string[];
      action?: KeywordAction;
      appliesTo?: KeywordAppliesTo;
      enabled?: boolean;
    }>(req);
    const who = actor(req);
    const result = await keywordRulesService.updateRule(id, body, { adminId: who.id, ip: who.ip });
    responseData({ res, message: responseMessage("success", "update", "Keyword rule"), result });
  }

  /** `DELETE /keyword-rules/:id` */
  async deleteRule(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const who = actor(req);
    await keywordRulesService.softDeleteRule(id, { adminId: who.id, ip: who.ip });
    responseData({ res, message: responseMessage("success", "delete", "Keyword rule"), result: { id, deleted: true } });
  }

  // ── Stats and operations ────────────────────────────────────────────────

  /** `GET /stats` */
  async stats(_req: Request, res: Response): Promise<void> {
    const result = await moderationAdminService.stats();
    responseData({ res, message: responseMessage("success", "fetch", "Moderation stats"), result });
  }

  /** `POST /broadcast` — A11's urgent area notice (superadmin). */
  async broadcast(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{ area: string; title: string; body: string }>(req);
    const result = await moderationAdminService.broadcast(body.area, body.title, body.body);
    responseData({ res, message: "Broadcast sent.", result });
  }

  /**
   * `POST /maintenance` — run the nightly job now (superadmin).
   *
   * The job is on a cron, but a retention promise nobody can trigger on demand is
   * a retention promise nobody can verify. This runs the same code path the
   * schedule does and returns what it did, so "files are destroyed after 30
   * days" is a claim an operator can check rather than take on trust.
   */
  async runMaintenance(_req: Request, res: Response): Promise<void> {
    const result = await reportMaintenanceService.run();
    responseData({ res, message: "Maintenance run complete.", result });
  }
}

export const moderationController = new ModerationController();
export default moderationController;
