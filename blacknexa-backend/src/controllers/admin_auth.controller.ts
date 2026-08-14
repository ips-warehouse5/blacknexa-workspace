/**
 * Admin authentication controller.
 *
 * These endpoints are new, so they are the one place that uses the project's
 * unified `responseData()` standard (`{ success: 1|0, message, result }`) rather
 * than the legacy Worker envelope. No existing client reads them, so there is no
 * contract to preserve — see `docs/MIGRATION_PLAN.md` §7.
 */

import type { Request, Response } from "express";
import authService from "@/services/auth.service";
import { responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import { validatedBody } from "@/middlewares/validate.middleware";
import type { AdminRole, LoginDto, RefreshDto } from "@/types/admin.interface";

class AdminAuthController {
  /** `POST /api/v1/admin/auth/login` */
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = validatedBody<LoginDto>(req);
    // `AuthError` from the service is mapped to its status by the error handler.
    const result = await authService.login(email, password);

    responseData({
      res,
      message: responseMessage("success", "login", "Admin"),
      result,
    });
  }

  /** `POST /api/v1/admin/auth/refresh` — rotates the refresh token. */
  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = validatedBody<RefreshDto>(req);
    const result = await authService.refresh(refreshToken);

    responseData({
      res,
      message: responseMessage("success", "refresh", "Session"),
      result,
    });
  }

  /**
   * `POST /api/v1/admin/auth/logout` — revokes the stored refresh id.
   *
   * The access token is not revoked; it expires on its own within minutes, and
   * maintaining a denylist for a 15-minute token is not worth the complexity.
   */
  async logout(req: Request, res: Response): Promise<void> {
    if (req.user) await authService.logout(req.user.id);

    responseData({
      res,
      message: responseMessage("success", "logout", "Admin"),
      result: null,
    });
  }

  /** `GET /api/v1/admin/auth/me` */
  async me(req: Request, res: Response): Promise<void> {
    const profile = req.user ? await authService.getProfile(req.user.id) : null;
    if (!profile) {
      responseData({
        res,
        status: 404,
        message: responseMessage("notFound", undefined, "Admin"),
        result: null,
      });
      return;
    }

    responseData({
      res,
      message: responseMessage("success", "fetch", "Profile"),
      result: profile,
    });
  }

  /** `POST /api/v1/admin/auth/admins` — create an operator. Super-admin only. */
  async createAdmin(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      email: string;
      name: string;
      password: string;
      role: AdminRole;
    }>(req);

    const profile = await authService.createAdmin(body);
    responseData({
      res,
      status: 201,
      message: responseMessage("success", "create", "Admin"),
      result: profile,
    });
  }
}

export const adminAuthController = new AdminAuthController();
export default adminAuthController;
