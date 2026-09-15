/**
 * Admin authentication controller.
 *
 * These endpoints use the project's unified `responseData()` standard
 * (`{ success: 1|0, message, result }`) rather than the legacy Worker envelope.
 * No mobile client reads them, so there is no contract to preserve — see
 * `docs/MIGRATION_PLAN.md` §7.
 */

import type { Request, Response } from "express";

import authService from "@/services/auth.service";
import { responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import { validatedBody } from "@/middlewares/validate.middleware";
import { permissionsForRole } from "@/config/rbac.config";
import type {
  AdminRole,
  ForgotPasswordDto,
  LoginDto,
  MfaResendDto,
  MfaVerifyDto,
  RefreshDto,
  ResetPasswordDto,
} from "@/types/admin.interface";

class AdminAuthController {
  /**
   * `POST /api/v1/admin/auth/login` — first factor.
   *
   * Returns a challenge, not a session. `AuthError` from the service is mapped
   * to its status by the error handler.
   */
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = validatedBody<LoginDto>(req);
    const challenge = await authService.login(email, password);

    responseData({
      res,
      message: "A security code has been sent to your email address.",
      result: challenge,
    });
  }

  /**
   * `POST /api/v1/admin/auth/mfa/verify` — second factor.
   *
   * The only endpoint that issues an operator session. The role's permission
   * list is returned alongside the profile so the console can render its
   * navigation without needing its own copy to agree on first paint.
   */
  async verifyMfa(req: Request, res: Response): Promise<void> {
    const { challengeId, code } = validatedBody<MfaVerifyDto>(req);
    const result = await authService.verifyMfa(challengeId, code);

    responseData({
      res,
      message: responseMessage("success", "login", "Admin"),
      result: {
        ...result,
        permissions: permissionsForRole(result.admin.role as AdminRole),
      },
    });
  }

  /** `POST /api/v1/admin/auth/mfa/resend` — issue a replacement code. */
  async resendMfa(req: Request, res: Response): Promise<void> {
    const { challengeId } = validatedBody<MfaResendDto>(req);
    const challenge = await authService.resendMfa(challengeId);

    responseData({
      res,
      message: "A new security code has been sent.",
      result: challenge,
    });
  }

  /** `POST /api/v1/admin/auth/refresh` — rotates the refresh token. */
  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = validatedBody<RefreshDto>(req);
    const result = await authService.refresh(refreshToken);

    responseData({
      res,
      message: responseMessage("success", "refresh", "Session"),
      result: {
        ...result,
        permissions: permissionsForRole(result.admin.role as AdminRole),
      },
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
      result: { ...profile, permissions: permissionsForRole(profile.role) },
    });
  }

  /**
   * `POST /api/v1/admin/auth/password/forgot`
   *
   * Always reports success. Whether the address has an account is not something
   * this endpoint will tell a caller — that would make it an enumeration tool.
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = validatedBody<ForgotPasswordDto>(req);
    await authService.requestPasswordReset(email);

    responseData({
      res,
      message: "If that account exists, a reset code has been sent to it.",
      result: null,
    });
  }

  /** `POST /api/v1/admin/auth/password/reset` */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, code, password } = validatedBody<ResetPasswordDto>(req);
    await authService.resetPassword(email, code, password);

    responseData({
      res,
      message: "Your password has been updated. Please sign in.",
      result: null,
    });
  }
}

export const adminAuthController = new AdminAuthController();
export default adminAuthController;
