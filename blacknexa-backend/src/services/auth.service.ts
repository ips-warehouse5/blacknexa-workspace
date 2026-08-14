/**
 * Admin authentication — bcrypt password verification and JWT issuance.
 *
 * Why this exists: the Worker had no authentication at all, so anyone who knew a
 * URL could trigger `POST /news/refresh-daily`, wipe-adjacent operations like
 * `POST /platform/persistence/restore`, or flip a payout to `succeeded`. Those
 * routes are now behind `adminAuthGuard`, and this service backs it.
 *
 * The mobile apps are unaffected: they hold no token for this API (they use Rork
 * OAuth against a different host) and none of the routes they call are guarded.
 *
 * Token design:
 *   • Access token — short-lived (15m default), carries role for RBAC.
 *   • Refresh token — long-lived, carries a `jti` that is stored on the admin row.
 *     Refreshing rotates the `jti`, so a stolen refresh token stops working the
 *     moment the legitimate holder refreshes, and logout revokes by nulling it.
 *   • `typ` distinguishes the two so a refresh token can never be presented as an
 *     access token.
 */

import jwt, { type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import AdminUser from "@/models/admin_user.model";
import { uuid } from "@/utils/id.util";
import type {
  AccessTokenPayload,
  AdminProfile,
  AdminRole,
  LoginResult,
  RefreshTokenPayload,
  TokenPair,
} from "@/types/admin.interface";

/** Thrown for expected auth failures so the controller can map them to a status. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
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

  // ── Flows ──────────────────────────────────────────────────────────────────

  /**
   * Log in with email and password.
   *
   * The same generic message is returned for an unknown email and a wrong
   * password so the endpoint cannot be used to enumerate accounts. A bcrypt
   * comparison is still performed for a nonexistent user to keep the response time
   * from revealing which case it was.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const admin = await AdminUser.scope("withSecret").findOne({
      where: { email: normalized },
    });

    if (!admin) {
      // Constant-ish work so timing does not distinguish unknown-email from
      // wrong-password. The hash is a throwaway.
      await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
      throw new AuthError("Invalid email or password.", 401);
    }
    if (!admin.is_active) {
      throw new AuthError("This account has been deactivated.", 403);
    }

    const valid = await admin.verifyPassword(password);
    if (!valid) {
      logger.warn("[auth] failed login attempt", { email: normalized });
      throw new AuthError("Invalid email or password.", 401);
    }

    const now = new Date().toISOString();
    await AdminUser.update({ last_login_at: now }, { where: { id: admin.id } });

    const tokens = await this.issueTokens(admin);
    logger.info("[auth] admin logged in", { id: admin.id, email: admin.email });

    return { admin: { ...this.toProfile(admin), lastLoginAt: now }, tokens };
  }

  /**
   * Exchange a refresh token for a new pair.
   *
   * The token's `jti` must match the one currently stored on the admin row. A
   * replayed (already-rotated) token therefore fails even though its signature is
   * still valid.
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

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /**
   * Create the first super-admin from `ADMIN_BOOTSTRAP_*` when no admin exists.
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

    // The model's beforeSave hook hashes this before it reaches the database.
    await AdminUser.create({
      email,
      name: "Bootstrap Super Admin",
      password_hash: password,
      role: "super-admin",
    });
    logger.warn(
      "[auth] bootstrap super-admin created — remove ADMIN_BOOTSTRAP_* from the environment now",
      { email },
    );
  }

  /** Create an admin. Used by a super-admin, not exposed as a public route. */
  async createAdmin(input: {
    email: string;
    name: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminProfile> {
    const existing = await AdminUser.findOne({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (existing) throw new AuthError("An admin with that email already exists.", 409);

    const admin = await AdminUser.create({
      email: input.email,
      name: input.name,
      password_hash: input.password,
      role: input.role,
    });
    return this.toProfile(admin);
  }

  /** Strip the hash and shape the public profile. */
  private toProfile(admin: AdminUser): AdminProfile {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.is_active,
      lastLoginAt: admin.last_login_at ?? null,
      createdAt: (admin.get("created_on") as Date | undefined)?.toISOString() ?? "",
    };
  }
}

export const authService = new AuthService();
export default authService;
