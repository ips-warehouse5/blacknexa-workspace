/**
 * Incident Management controller — `/api/v1/admin/incidents`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §9.1. Thin, like its moderation sibling: access
 * tiers, the D16 refusal, the state checks and everything a decision writes are
 * in `incident_admin.service.ts`. This layer reads the validated request, names
 * the acting operator (whose role decides the access tier), and shapes the
 * envelope — `result: T[]` plus a top-level `pagination` block for the list,
 * which the console's `apiGetPage` reads. The contract is written out in
 * `docs/ADMIN_MODERATION_API.md`.
 */

import type { Request, Response } from "express";
import incidentAdminService, {
  type IncidentListQuery,
  type IncidentMetricsRange,
  type IncidentModerationFilter,
  type IncidentRange,
  type IncidentSort,
  type IncidentStatusTab,
} from "@/services/incident_admin.service";
import type { AdminActor } from "@/services/admin_guard.service";
import { buildPagination, responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import type { DeactivateReasonCode, DismissReasonCode } from "@/types/moderation.interface";
import type { ReportCategory } from "@/types/report.interface";

/** The acting operator — see `moderation.controller.ts`. */
function actor(req: Request): AdminActor {
  return {
    id: req.user?.id ?? "",
    email: req.user?.email ?? "",
    role: req.user?.role ?? "",
    ip: req.ip ?? null,
  };
}

class IncidentController {
  /** `GET /` */
  async list(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      page: number;
      limit: number;
      status: IncidentStatusTab;
      category?: ReportCategory | "all";
      from?: string;
      to?: string;
      range?: IncidentRange;
      search?: string;
      sort: IncidentSort;
      assignee?: string;
      moderation?: IncidentModerationFilter;
      urgent?: boolean;
    }>(req);

    const params: IncidentListQuery = {
      page: query.page,
      limit: query.limit,
      status: query.status,
      sort: query.sort,
      ...(query.category && query.category !== "all" ? { category: query.category } : {}),
      ...(query.range ? { range: query.range } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.assignee ? { assignee: query.assignee } : {}),
      ...(query.moderation ? { moderation: query.moderation } : {}),
      ...(typeof query.urgent === "boolean" ? { urgent: query.urgent } : {}),
    };
    const { items, total } = await incidentAdminService.list(actor(req), params);
    responseData({
      res,
      message: responseMessage("success", "list", "Incidents"),
      result: items,
      pagination: buildPagination(query.page, query.limit, total),
    });
  }

  /** `GET /summary` */
  async summary(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{ assignee?: string }>(req);
    const result = await incidentAdminService.summary(actor(req), query);
    responseData({ res, message: responseMessage("success", "fetch", "Incident summary"), result });
  }

  /** `GET /metrics` — the dashboard's activity and category figures, in the caller's scope. */
  async metrics(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{ range: IncidentMetricsRange }>(req);
    const result = await incidentAdminService.metrics(actor(req), query);
    responseData({ res, message: responseMessage("success", "fetch", "Incident metrics"), result });
  }

  /** `GET /assignees` */
  async assignees(_req: Request, res: Response): Promise<void> {
    const result = await incidentAdminService.assignees();
    responseData({ res, message: responseMessage("success", "list", "Assignees"), result });
  }

  /** `GET /:id` */
  async detail(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await incidentAdminService.detail(actor(req), id);
    responseData({ res, message: responseMessage("success", "fetch", "Incident"), result });
  }

  /** `GET /:id/evidence/:evidenceId` */
  async evidence(req: Request, res: Response): Promise<void> {
    const { id, evidenceId } = validatedParams<{ id: string; evidenceId: string }>(req);
    const result = await incidentAdminService.evidenceUrl(actor(req), id, evidenceId);
    responseData({ res, message: "Link ready.", result });
  }

  /** `POST /:id/verify` */
  async verify(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ note?: string }>(req);
    const result = await incidentAdminService.verify(actor(req), id, body);
    responseData({ res, message: "Incident verified.", result });
  }

  /** `POST /:id/dismiss` */
  async dismiss(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ reasonCode: DismissReasonCode; publicNote?: string; internalNote?: string }>(req);
    const result = await incidentAdminService.dismiss(actor(req), id, body);
    responseData({ res, message: "Incident dismissed. The reporter has been told the outcome.", result });
  }

  /** `POST /:id/reopen` */
  async reopen(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ note: string }>(req);
    const result = await incidentAdminService.reopen(actor(req), id, body);
    responseData({ res, message: "Case reopened.", result });
  }

  /** `POST /:id/deactivate` */
  async deactivate(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{
      reasonCode: DeactivateReasonCode;
      publicNote?: string;
      internalNote?: string;
    }>(req);
    const result = await incidentAdminService.deactivate(actor(req), id, body);
    responseData({ res, message: "Incident deactivated and taken down from public view.", result });
  }

  /** `POST /:id/reactivate` */
  async reactivate(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ note?: string }>(req);
    const result = await incidentAdminService.reactivate(actor(req), id, body);
    responseData({
      res,
      message:
        result.moderationState === "approved"
          ? "Incident reactivated and published again."
          : "Incident reactivated. It goes through the check again before it is published.",
      result,
    });
  }

  /** `POST /:id/assign` */
  async assign(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ adminId: string | null }>(req);
    const result = await incidentAdminService.assign(actor(req), id, body);
    responseData({
      res,
      message: !result.changed ? "No change." : result.assignee ? "Case assigned." : "Case unassigned.",
      result,
    });
  }

  /** `POST /:id/notes` */
  async addNote(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ body: string }>(req);
    const result = await incidentAdminService.addNote(actor(req), id, body);
    responseData({ res, status: 201, message: "Note added to the case record.", result });
  }
}

export const incidentController = new IncidentController();
export default incidentController;
