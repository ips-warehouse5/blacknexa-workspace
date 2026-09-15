/**
 * Staff directory controller — the Admin & Roles module.
 *
 * Thin by design: the rules about who may act on whom live in
 * `admin_staff.service`, so that a second entry point (a script, a future
 * endpoint) cannot bypass them by not going through a controller.
 */

import type { Request, Response } from "express";

import adminStaffService from "@/services/admin_staff.service";
import { buildPagination, responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import type { AdminRole } from "@/types/admin.interface";

/** The acting operator, as the service needs them. */
function actor(req: Request): { id: string; role: string } {
  // Every route here runs behind `adminAuthGuard`, so `req.user` is present.
  // The fallback exists so a mis-ordered middleware stack fails as a denial
  // rather than a crash.
  return { id: req.user?.id ?? "", role: req.user?.role ?? "" };
}

class AdminStaffController {
  /** `GET /api/v1/admin/staff` */
  async list(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      page: number;
      limit: number;
      search?: string;
      role?: AdminRole;
      status?: "active" | "disabled";
    }>(req);

    const { items, total } = await adminStaffService.list(
      {
        page: query.page,
        limit: query.limit,
        // Spread conditionally: the service distinguishes "no filter" from
        // "filter on undefined", and Joi omits keys rather than nulling them.
        ...(query.search ? { search: query.search } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      actor(req).role,
    );

    responseData({
      res,
      message: responseMessage("success", "list", "Staff"),
      result: items,
      pagination: buildPagination(query.page, query.limit, total),
    });
  }

  /** `GET /api/v1/admin/staff/summary` — active counts per role. */
  async summary(req: Request, res: Response): Promise<void> {
    const counts = await adminStaffService.summary(actor(req).role);

    responseData({
      res,
      message: responseMessage("success", "fetch", "Staff summary"),
      result: counts,
    });
  }

  /** `POST /api/v1/admin/staff` */
  async create(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      name: string;
      email: string;
      role: AdminRole;
      password: string;
    }>(req);

    const profile = await adminStaffService.create(body, actor(req));

    responseData({
      res,
      status: 201,
      message: responseMessage("success", "create", "Staff account"),
      result: profile,
    });
  }

  /** `PATCH /api/v1/admin/staff/:id` */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ name?: string; role?: AdminRole }>(req);

    const profile = await adminStaffService.update(id, body, actor(req));

    responseData({
      res,
      message: responseMessage("success", "update", "Staff account"),
      result: profile,
    });
  }

  /** `PATCH /api/v1/admin/staff/:id/status` */
  async setStatus(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const { isActive } = validatedBody<{ isActive: boolean }>(req);

    const profile = await adminStaffService.setActive(id, isActive, actor(req));

    responseData({
      res,
      message: isActive
        ? "The account has been enabled."
        : "The account has been disabled and signed out.",
      result: profile,
    });
  }

  /**
   * `POST /api/v1/admin/staff/:id/reset-password`
   *
   * The generated password is in this response and nowhere else — only its hash
   * is stored — so the console must show it to the operator before they navigate
   * away.
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await adminStaffService.resetPassword(id, actor(req));

    responseData({
      res,
      message: "A temporary password has been generated. It is shown only once.",
      result,
    });
  }

  /** `DELETE /api/v1/admin/staff/:id` */
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    await adminStaffService.remove(id, actor(req));

    responseData({
      res,
      message: responseMessage("success", "delete", "Staff account"),
      result: null,
    });
  }
}

export const adminStaffController = new AdminStaffController();
export default adminStaffController;
