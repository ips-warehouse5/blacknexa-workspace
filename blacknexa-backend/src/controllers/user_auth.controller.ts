/**
 * End-user authentication controller — `/api/v1/auth` and `/api/v1/users/me`.
 *
 * New surface with no legacy client, so it uses the project's unified
 * `responseData()` standard rather than the Worker-compatible envelope.
 *
 * ── The disclosure rule ─────────────────────────────────────────────────────
 * `register` and `forgotPassword` return **200 with an identical body** whether
 * or not the address has an account. That is not laxity — screens A10 and A13
 * both promise it in copy ("A wrong password and an unknown email share one
 * identical message"; "We don't say whether one does"). Any branch here that
 * returned 409 for a taken address, or 404 for an unknown one, would break the
 * promise the UI makes to the user.
 */

import crypto from "crypto";
import type { Request, Response } from "express";
import env from "@/config/env.config";
import userAuthService from "@/services/user_auth.service";
import accountDeletionService, {
  type Disposition,
} from "@/services/account_deletion.service";
import { responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import { validatedBody } from "@/middlewares/validate.middleware";
import type {
  ForgotPasswordDto,
  LoginDto,
  OtpChallengeResult,
  RecordConsentDto,
  RegisterDeviceDto,
  RegisterDto,
  ResendCodeDto,
  ResetPasswordDto,
  SocialLoginDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from "@/types/user.interface";

/**
 * Device context, taken from the request rather than trusted wholesale.
 *
 * The label is a convenience for the session list, so a client-supplied string is
 * fine — but it is bounded, and the platform falls back to the User-Agent so an
 * omitted field still produces something recognisable in Profile → Security.
 */
function deviceFrom(req: Request, body: { deviceLabel?: string; platform?: string }) {
  const agent = req.headers["user-agent"];
  return {
    deviceLabel: body.deviceLabel || (typeof agent === "string" ? agent.slice(0, 120) : ""),
    platform: body.platform,
  };
}

/** Hash the caller's IP for the consent record — evidence, not a readable address. */
function ipHash(req: Request): string | null {
  if (!req.ip) return null;
  return crypto.createHash("sha256").update(req.ip).digest("hex").slice(0, 64);
}

/** The challenge shape shared by register, resend and forgot-password. */
function challenge(resendAfterSeconds: number): OtpChallengeResult {
  return { resendAfterSeconds, expiresInSeconds: env.otp.ttlSeconds };
}

class UserAuthController {
  /**
   * `POST /api/v1/auth/register` — screen A6.
   *
   * Always 202: the account may or may not have been created, and saying which
   * would disclose whether the address was already registered.
   */
  async register(req: Request, res: Response): Promise<void> {
    const body = validatedBody<RegisterDto>(req);
    await userAuthService.register(body.email, body.password);

    responseData({
      res,
      status: 202,
      message: "If that address can be registered, a verification code is on its way.",
      result: challenge(env.otp.resendCooldownSeconds),
    });
  }

  /** `POST /api/v1/auth/verify-email` — screen A8. Signs the member in. */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const body = validatedBody<VerifyEmailDto>(req);
    const result = await userAuthService.verifyEmail(
      body.email,
      body.code,
      deviceFrom(req, body),
    );

    responseData({
      res,
      message: "Your email is confirmed.",
      result,
    });
  }

  /** `POST /api/v1/auth/resend-code` — screens A8 and A14. */
  async resendCode(req: Request, res: Response): Promise<void> {
    const body = validatedBody<ResendCodeDto>(req);
    const resendAfterSeconds = await userAuthService.resendCode(body.email, body.purpose);

    responseData({
      res,
      status: 202,
      message: "If a code can be sent to that address, it is on its way.",
      result: challenge(resendAfterSeconds),
    });
  }

  /** `POST /api/v1/auth/login` — screen A10. */
  async login(req: Request, res: Response): Promise<void> {
    const body = validatedBody<LoginDto>(req);
    const result = await userAuthService.login(
      body.email,
      body.password,
      deviceFrom(req, body),
    );

    responseData({
      res,
      message: responseMessage("success", "login", "Member"),
      result,
    });
  }

  /** `POST /api/v1/auth/oauth/:provider` — screen A5. */
  async socialLogin(req: Request, res: Response): Promise<void> {
    const body = validatedBody<SocialLoginDto>(req);
    const result = await userAuthService.socialLogin(
      body.provider,
      body.identityToken,
      body.fullName,
      deviceFrom(req, body),
    );

    responseData({
      res,
      message: responseMessage("success", "login", "Member"),
      result,
    });
  }

  /** `POST /api/v1/auth/refresh` — rotates the refresh token. */
  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = validatedBody<{ refreshToken: string }>(req);
    const result = await userAuthService.refresh(refreshToken);

    responseData({
      res,
      message: responseMessage("success", "refresh", "Session"),
      result,
    });
  }

  /** `POST /api/v1/auth/logout` — revokes this device's session only. */
  async logout(req: Request, res: Response): Promise<void> {
    if (req.user) await userAuthService.logout(req.user.id, req.user.sessionId);

    responseData({
      res,
      message: responseMessage("success", "logout", "Member"),
      result: null,
    });
  }

  /** `POST /api/v1/auth/logout-all` — "sign out everywhere", including here. */
  async logoutAll(req: Request, res: Response): Promise<void> {
    const revoked = req.user ? await userAuthService.revokeAllSessions(req.user.id) : 0;

    responseData({
      res,
      message: "Signed out on every device.",
      result: { sessionsRevoked: revoked },
    });
  }

  /**
   * `POST /api/v1/auth/password/forgot` — screen A13.
   *
   * Identical response for a registered and an unregistered address. The service
   * also dispatches the mail in the background so the two cannot be told apart by
   * response time either.
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const body = validatedBody<ForgotPasswordDto>(req);
    const { resendAfterSeconds } = await userAuthService.forgotPassword(body.email);

    responseData({
      res,
      status: 202,
      message: "If an account exists for that address, a code is on its way.",
      result: challenge(resendAfterSeconds),
    });
  }

  /**
   * `POST /api/v1/auth/password/reset` — screens A14 → A15.
   *
   * Signs the caller in on this device and ends every other session, which is
   * exactly what A15 tells the user has happened.
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const body = validatedBody<ResetPasswordDto>(req);
    const result = await userAuthService.resetPassword(
      body.email,
      body.code,
      body.password,
      deviceFrom(req, body),
    );

    responseData({
      res,
      message: "Your password is changed. Every other device has been signed out.",
      result,
    });
  }

  /** `GET /api/v1/auth/me` */
  async me(req: Request, res: Response): Promise<void> {
    const profile = req.user ? await userAuthService.getProfile(req.user.id) : null;
    if (!profile) {
      responseData({
        res,
        status: 404,
        message: responseMessage("notFound", undefined, "Account"),
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

  /** `PATCH /api/v1/users/me` — screen A9 and Profile → Defaults. */
  async updateProfile(req: Request, res: Response): Promise<void> {
    const body = validatedBody<UpdateProfileDto>(req);
    const profile = await userAuthService.updateProfile(req.user!.id, body);

    responseData({
      res,
      message: responseMessage("success", "update", "Profile"),
      result: profile,
    });
  }

  /** `GET /api/v1/users/me/sessions` — Profile → Security. */
  async listSessions(req: Request, res: Response): Promise<void> {
    const sessions = await userAuthService.listSessions(req.user!.id, req.user!.sessionId);

    responseData({
      res,
      message: responseMessage("success", "list", "Session"),
      result: sessions,
    });
  }

  /** `POST /api/v1/users/me/consents` — screen A7. */
  async recordConsents(req: Request, res: Response): Promise<void> {
    const body = validatedBody<RecordConsentDto>(req);
    const agent = req.headers["user-agent"];

    await userAuthService.recordConsents(req.user!.id, body.documents, body.version, {
      ipHash: ipHash(req),
      userAgent: typeof agent === "string" ? agent : null,
    });

    responseData({
      res,
      status: 201,
      message: "Your agreement has been recorded.",
      result: null,
    });
  }

  /** `POST /api/v1/users/me/devices` — screen A11's push token. */
  async registerDevice(req: Request, res: Response): Promise<void> {
    const body = validatedBody<RegisterDeviceDto>(req);
    await userAuthService.registerPushToken(
      req.user!.id,
      req.user!.sessionId,
      body.pushToken,
    );

    responseData({
      res,
      message: "This device will receive notifications.",
      result: null,
    });
  }

  /**
   * `DELETE /api/v1/users/me` — the account, and everything that hangs off it.
   *
   * The `disposition` is required rather than defaulted. Choosing on someone's
   * behalf between "keep my reports as record" and "erase them too" is not a
   * default we get to pick, so a request without one is a validation error.
   *
   * Returns the receipt before the client signs out, so the confirmation screen can
   * say what actually happened rather than "done".
   */
  async deleteAccount(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      disposition: Disposition;
      password?: string;
      code?: string;
    }>(req);

    /*
     * Re-authenticate first. Everything else in the app is undoable; this is not,
     * and an unlocked phone in the wrong hands should not be enough. Accounts with
     * no password — Apple or Google only — confirm with a code to the address on
     * file instead, issued by `requestDeletionCode` below.
     */
    await userAuthService.assertDeletionConfirmed(req.user!.id, {
      password: body.password,
      code: body.code,
    });

    const receipt = await accountDeletionService.deleteAccount(req.user!.id, body.disposition);

    responseData({
      res,
      message: "Your account has been deleted.",
      result: receipt,
    });
  }

  /**
   * `POST /api/v1/users/me/deletion-code` — for accounts with no password.
   *
   * Apple- and Google-only accounts have nothing to re-type, so they confirm with a
   * one-time code to the address on file. Same purpose, same six digits, different
   * proof.
   */
  async requestDeletionCode(req: Request, res: Response): Promise<void> {
    await userAuthService.issueDeletionCode(req.user!.id);
    responseData({
      res,
      message: "We have sent a code to your email address.",
      result: null,
    });
  }
}

export const userAuthController = new UserAuthController();
export default userAuthController;
