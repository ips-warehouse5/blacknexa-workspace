/**
 * Admin authentication — password verification, second factor, JWT issuance.
 *
 * Why this exists: the Worker had no authentication at all, so anyone who knew a
 * URL could trigger `POST /news/refresh-daily`, wipe-adjacent operations like
 * `POST /platform/persistence/restore`, or flip a payout to `succeeded`. Those
 * routes are now behind `adminAuthGuard`, and this service backs it — and the
 * admin console.
 *
 * ── Sign-in is two steps, and that is load-bearing ──────────────────────────
 * `login` verifies the password and returns a challenge id. `verifyMfa`
 * verifies the emailed code and is the only method that issues tokens. There is
 * no path in which a correct password alone produces a session, so a leaked
 * password is not by itself enough to sign in.
 *
 * ── Token design ────────────────────────────────────────────────────────────
 *   • Access token — short-lived (15m default), carries role for RBAC.
 *   • Refresh token — long-lived, carries a `jti` stored on the admin row.
 *     Refreshing rotates the `jti`, so a stolen refresh token stops working the
 *     moment the legitimate holder refreshes, and logout revokes by nulling it.
 *   • `typ` distinguishes the two so a refresh token can never be presented as
 *     an access token.
 */

import jwt, { type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import AdminUser from "@/models/admin_user.model";
import AdminCredential, {
  generateCode,
  hashCode,
  type CredentialPurpose,
} from "@/models/admin_credential.model";
import mailerService from "@/services/mailer.service";
import { uuid } from "@/utils/id.util";
import type {
  AccessTokenPayload,
  AdminProfile,
  AdminRole,
  LoginResult,
  MfaChallengeResult,
  RefreshTokenPayload,
  TokenPair,
} from "@/types/admin.interface";

/** Thrown for expected auth failures so the controller can map them to a status. */
export class AuthError extends Error {
  readonly status: number;
  /** Seconds until the caller may retry. Emitted as `Retry-After` on a 429. */
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ── Policy ──────────────────────────────────────────────────────────────────
// Matching the values the console's Settings screen displays. Changing one
// means changing the other; they are few enough that a constant is clearer
// than a configuration table nobody edits.

/** Failed password attempts before the account locks. */
const MAX_LOGIN_ATTEMPTS = 5;
/** How long the lockout lasts. */
const LOCKOUT_MS = 15 * 60 * 1000;
/** How long an emailed code stays valid. */
const CODE_TTL_MS = 5 * 60 * 1000;
/** Wrong code guesses before the challenge is destroyed. */
const MAX_CODE_ATTEMPTS = 5;
/** How many replacement codes one sign-in may request. */
const MAX_RESENDS = 3;
/** How long before a replacement code may be requested. */
const RESEND_COOLDOWN_SECONDS = 30;
const CODE_LENGTH = 6;

/**
 * Mask an address for display: `devon@blacknexa.com` → `d•••n@blacknexa.com`.
 *
 * Enough for the operator to recognise which mailbox to check, not enough to
 * confirm a full address to somebody who only guessed it.
 */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (local.length <= 2) return `${local.charAt(0)}•••@${domain}`;
  return `${local.charAt(0)}•••${local.charAt(local.length - 1)}@${domain}`;
}

/** Two-letter monogram from a display name, for the console sidebar. */
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

class AuthService {
  // ── Token issuance ─────────────────────────────────────────────────────────

  private signAccessToken(admin: AdminUser): string {
    const payload: AccessTokenPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      aud: "admin",
      typ: "access",
    };
    return jwt.sign(payload, env.jwt.accessSecret, {
      expiresIn: env.jwt.accessExpiresIn,
    } as SignOptions);
  }

  private signRefreshToken(admin: AdminUser, jti: string): string {
    const payload: RefreshTokenPayload = {
      sub: admin.id,
      aud: "admin",
      jti,
      typ: "refresh",
    };
    return jwt.sign(payload, env.jwt.refreshSecret, {
      expiresIn: env.jwt.refreshExpiresIn,
    } as SignOptions);
  }

  /** Issue a fresh pair and persist the new refresh id, invalidating the old one. */
  private async issueTokens(admin: AdminUser): Promise<TokenPair> {
    const jti = uuid();
    await AdminUser.update({ refresh_token_id: jti }, { where: { id: admin.id } });
    return {
      accessToken: this.signAccessToken(admin),
      refreshToken: this.signRefreshToken(admin, jti),
      tokenType: "Bearer",
      expiresIn: env.jwt.accessExpiresIn,
    };
  }

  // ── Verification ───────────────────────────────────────────────────────────

  /** Verify an access token. Throws `AuthError` on anything unexpected. */
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
      if (decoded.typ !== "access") {
        throw new AuthError("Invalid token type.", 401);
      }
      return decoded;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthError("Access token has expired.", 401);
      }
      throw new AuthError("Invalid access token.", 401);
    }
  }

  /** Verify a refresh token's signature and shape. */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
      if (decoded.typ !== "refresh") {
        throw new AuthError("Invalid token type.", 401);
      }
      return decoded;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthError("Refresh token has expired. Please sign in again.", 401);
      }
      throw new AuthError("Invalid refresh token.", 401);
    }
  }

  // ── One-time codes ─────────────────────────────────────────────────────────

  /**
   * Issue a code and email it.
   *
   * Any earlier unconsumed code for the same purpose is invalidated first, so an
   * operator who requested three codes cannot have three live at once — only the
   * newest works, which is what people expect and what keeps the guessing
   * surface to one code.
   */
  private async issueCode(
    admin: AdminUser,
    purpose: CredentialPurpose,
    options: { resendCount?: number } = {},
  ): Promise<{ credential: AdminCredential; code: string }> {
    const now = new Date().toISOString();
    await AdminCredential.update(
      { consumed_at: now },
      { where: { admin_id: admin.id, purpose, consumed_at: null } },
    );

    const code = generateCode(CODE_LENGTH);
    const credential = await AdminCredential.create({
      admin_id: admin.id,
      purpose,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      resend_count: options.resendCount ?? 0,
    });

    return { credential, code };
  }

  /** Shape a challenge for the client. The raw code is dev-only. */
  private toChallenge(
    admin: AdminUser,
    credential: AdminCredential,
    code: string,
  ): MfaChallengeResult {
    return {
      challengeId: credential.id,
      email: maskEmail(admin.email),
      codeLength: CODE_LENGTH,
      resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: credential.secondsRemaining,
      /*
       * Returning the code outside production keeps local development working
       * without a mail transport. The guard is on NODE_ENV rather than on
       * whether mail happens to be configured, so a production box with a
       * broken mailer fails loudly instead of leaking codes over the wire.
       */
      ...(env.isProduction ? {} : { devCode: code }),
    };
  }

  // ── Flows ──────────────────────────────────────────────────────────────────

  /**
   * First factor: email and password.
   *
   * The same generic message is returned for an unknown email and a wrong
   * password so the endpoint cannot be used to enumerate accounts. A bcrypt
   * comparison is still performed for a nonexistent user so the response time
   * does not reveal which case it was.
   *
   * Returns a challenge, never a session.
   */
  async login(email: string, password: string): Promise<MfaChallengeResult> {
    const normalized = email.trim().toLowerCase();
    const admin = await AdminUser.scope("withSecret").findOne({
      where: { email: normalized },
    });

    if (!admin) {
      await bcrypt.compare(password, env.bcryptDummyHash);
      throw new AuthError("Invalid email or password.", 401);
    }

    // Checked before the password so a locked account cannot be used as an
    // oracle for whether a guessed password was right.
    if (admin.isLocked) {
      throw new AuthError(
        "Too many failed attempts. This account is temporarily locked.",
        429,
        admin.lockoutSecondsRemaining,
      );
    }

    if (!admin.is_active) {
      throw new AuthError(
        "This account has been deactivated. Contact a Super Admin.",
        403,
      );
    }

    const valid = await admin.verifyPassword(password);
    if (!valid) {
      await this.recordFailedAttempt(admin);
      logger.warn("[auth] failed login attempt", { email: normalized });
      throw new AuthError("Invalid email or password.", 401);
    }

    // The password was right: clear the counter before the second factor, so a
    // later MFA failure does not also count against the password lockout.
    if (admin.failed_login_count > 0 || admin.locked_until) {
      await AdminUser.update(
        { failed_login_count: 0, locked_until: null },
        { where: { id: admin.id } },
      );
    }

    const { credential, code } = await this.issueCode(admin, "mfa");
    await mailerService.sendAdminMfaCode(admin.email, code, CODE_TTL_MS / 1000);

    logger.info("[auth] mfa challenge issued", { id: admin.id });
    return this.toChallenge(admin, credential, code);
  }

  /** Count a failed password attempt, locking the account at the cap. */
  private async recordFailedAttempt(admin: AdminUser): Promise<void> {
    const attempts = admin.failed_login_count + 1;

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await AdminUser.update(
        {
          failed_login_count: attempts,
          locked_until: new Date(Date.now() + LOCKOUT_MS).toISOString(),
        },
        { where: { id: admin.id } },
      );
      logger.warn("[auth] account locked after repeated failures", {
        id: admin.id,
        attempts,
      });
      return;
    }

    await AdminUser.update({ failed_login_count: attempts }, { where: { id: admin.id } });
  }

  /**
   * Second factor: the emailed code. This is what issues a session.
   *
   * A wrong code burns an attempt; five wrong codes destroy the challenge and
   * the operator starts again from the password. That is what stops a six-digit
   * code from being guessable — not its length.
   */
  async verifyMfa(challengeId: string, code: string): Promise<LoginResult> {
    const credential = await AdminCredential.findOne({
      where: { id: challengeId, purpose: "mfa" },
    });

    if (!credential || !credential.isUsable) {
      throw new AuthError(
        "That sign-in has expired. Please enter your password again.",
        401,
      );
    }

    if (credential.code_hash !== hashCode(code)) {
      const attempts = credential.attempts + 1;

      if (attempts >= MAX_CODE_ATTEMPTS) {
        await credential.update({
          attempts,
          consumed_at: new Date().toISOString(),
        });
        throw new AuthError(
          "Too many incorrect codes. Please sign in again.",
          401,
        );
      }

      await credential.update({ attempts });
      const left = MAX_CODE_ATTEMPTS - attempts;
      throw new AuthError(
        `Incorrect security code. ${left} attempt${left === 1 ? "" : "s"} remaining.`,
        401,
      );
    }

    const admin = await AdminUser.findByPk(credential.admin_id);
    if (!admin || !admin.is_active) {
      throw new AuthError("This account is no longer active.", 403);
    }

    // Single-use: mark it spent before issuing anything, so a replayed request
    // cannot mint a second session from the same code.
    await credential.update({ consumed_at: new Date().toISOString() });

    const now = new Date().toISOString();
    await AdminUser.update(
      { last_login_at: now, failed_login_count: 0, locked_until: null },
      { where: { id: admin.id } },
    );

    const tokens = await this.issueTokens(admin);
    logger.info("[auth] admin signed in", { id: admin.id, email: admin.email });

    return { admin: { ...this.toProfile(admin), lastLoginAt: now }, tokens };
  }

  /**
   * Issue a replacement code for a sign-in already in progress.
   *
   * Capped, because without a cap this is a free way to send mail to any address
   * an attacker knows belongs to an operator.
   */
  async resendMfa(challengeId: string): Promise<MfaChallengeResult> {
    const existing = await AdminCredential.findOne({
      where: { id: challengeId, purpose: "mfa" },
    });

    if (!existing || existing.consumed_at) {
      throw new AuthError(
        "That sign-in has expired. Please enter your password again.",
        401,
      );
    }

    if (existing.resend_count >= MAX_RESENDS) {
      throw new AuthError(
        "You have requested too many codes. Please sign in again.",
        429,
      );
    }

    const admin = await AdminUser.findByPk(existing.admin_id);
    if (!admin || !admin.is_active) {
      throw new AuthError("This account is no longer active.", 403);
    }

    const { credential, code } = await this.issueCode(admin, "mfa", {
      resendCount: existing.resend_count + 1,
    });
    await mailerService.sendAdminMfaCode(admin.email, code, CODE_TTL_MS / 1000);

    return this.toChallenge(admin, credential, code);
  }

  /**
   * Exchange a refresh token for a new pair.
   *
   * The token's `jti` must match the one currently stored on the admin row. A
   * replayed (already-rotated) token therefore fails even though its signature
   * is still valid.
   */
  async refresh(refreshToken: string): Promise<LoginResult> {
    const decoded = this.verifyRefreshToken(refreshToken);

    const admin = await AdminUser.findByPk(decoded.sub);
    if (!admin || !admin.is_active) {
      throw new AuthError("Account is no longer active.", 403);
    }
    if (!admin.refresh_token_id || admin.refresh_token_id !== decoded.jti) {
      logger.warn("[auth] refresh token replay rejected", { id: admin.id });
      throw new AuthError("Refresh token has been revoked. Please sign in again.", 401);
    }

    const tokens = await this.issueTokens(admin);
    return { admin: this.toProfile(admin), tokens };
  }

  /** Revoke the current refresh token. The access token expires on its own. */
  async logout(adminId: string): Promise<void> {
    await AdminUser.update({ refresh_token_id: null }, { where: { id: adminId } });
  }

  /** Load a profile by id, for `GET /admin/auth/me`. */
  async getProfile(adminId: string): Promise<AdminProfile | null> {
    const admin = await AdminUser.findByPk(adminId);
    return admin ? this.toProfile(admin) : null;
  }

  // ── Password recovery ──────────────────────────────────────────────────────

  /**
   * Send a reset code.
   *
   * Returns without error whether or not the account exists. Saying "no such
   * account" would turn this endpoint into a way to discover which addresses are
   * administrators, which is worth more to an attacker than a precise error is
   * to anyone else.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const admin = await AdminUser.findOne({ where: { email: normalized } });

    if (!admin || !admin.is_active) {
      logger.info("[auth] password reset requested for unknown or inactive account", {
        email: normalized,
      });
      return;
    }

    const { code } = await this.issueCode(admin, "password_reset");
    await mailerService.sendAdminPasswordReset(admin.email, code, CODE_TTL_MS / 1000);
    logger.info("[auth] password reset code issued", { id: admin.id });
  }

  /**
   * Consume a reset code and set a new password.
   *
   * Every refresh token for the account is revoked as part of this, so a reset
   * also ends any session an attacker may already hold — which is the main
   * reason someone resets a password they still know.
   */
  async resetPassword(email: string, code: string, password: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const admin = await AdminUser.findOne({ where: { email: normalized } });

    // Generic failure: a valid-looking code for an unknown address must not be
    // distinguishable from an invalid code for a known one.
    const genericFailure = new AuthError(
      "That reset code is invalid or has expired.",
      400,
    );

    if (!admin) throw genericFailure;

    const credential = await AdminCredential.findOne({
      where: {
        admin_id: admin.id,
        purpose: "password_reset",
        consumed_at: null,
        expires_at: { [Op.gt]: new Date().toISOString() },
      },
      order: [["created_on", "DESC"]],
    });

    if (!credential || credential.code_hash !== hashCode(code)) {
      if (credential) await credential.update({ attempts: credential.attempts + 1 });
      throw genericFailure;
    }

    await credential.update({ consumed_at: new Date().toISOString() });

    // The model's beforeSave hook hashes this before it reaches the database.
    admin.password_hash = password;
    admin.refresh_token_id = null;
    admin.failed_login_count = 0;
    admin.locked_until = null;
    admin.must_change_password = false;
    await admin.save();

    logger.info("[auth] password reset completed", { id: admin.id });
  }

  /** Remove spent and expired codes. Called by the maintenance job. */
  async pruneExpiredCredentials(): Promise<number> {
    return AdminCredential.destroy({
      where: {
        [Op.or]: [
          { consumed_at: { [Op.ne]: null } },
          { expires_at: { [Op.lt]: new Date(Date.now() - CODE_TTL_MS).toISOString() } },
        ],
      },
    });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /**
   * Create the first super admin from `ADMIN_BOOTSTRAP_*` when no admin exists.
   *
   * Skipped entirely once any admin row is present, so leaving the variables set
   * cannot silently reset or duplicate an account — though they should be removed
   * once the account exists.
   */
  async bootstrapAdmin(): Promise<void> {
    const { email, password } = env.adminBootstrap;
    if (!email || !password) return;

    const existing = await AdminUser.count();
    if (existing > 0) {
      logger.info("[auth] bootstrap skipped — an admin already exists");
      return;
    }

    await AdminUser.create({
      email,
      name: "Bootstrap Super Admin",
      password_hash: password,
      role: "superadmin",
    });
    logger.warn(
      "[auth] bootstrap super admin created — remove ADMIN_BOOTSTRAP_* from the environment now",
      { email },
    );
  }

  /** Strip the hash and shape the public profile. */
  toProfile(admin: AdminUser): AdminProfile {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as AdminRole,
      avatar: monogram(admin.name),
      isActive: admin.is_active,
      lastLoginAt: admin.last_login_at ?? null,
      createdAt: (admin.get("created_on") as Date | undefined)?.toISOString() ?? "",
    };
  }
}

export const authService = new AuthService();
export default authService;
