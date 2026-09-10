/**
 * End-user authentication — screens A5 through A15.
 *
 * Shares the token design in `auth.service.ts` (short access token, rotating
 * refresh token, `typ` discriminator so one can never be presented as the other)
 * but differs in two ways that come straight from the design:
 *
 *   • **Sessions are per device.** `admin_users` keeps one `refresh_token_id`
 *     column, which permits one live session. A15 promises "You're logged in on
 *     this device. Every other device has been signed out." — so a member's
 *     sessions are rows, and a reset revokes every row *except* the caller's.
 *
 *   • **Nothing here discloses whether an account exists.** A10's error copy is
 *     identical for a wrong password and an unknown email; A13 says outright "We
 *     don't say whether one does." Both are enforced below by doing the same
 *     amount of work and returning the same shape on every path — including the
 *     bcrypt comparison against a throwaway hash for an unknown address, and
 *     dispatching mail in the background so the response time cannot be read as
 *     a signal either.
 *
 * Every method that establishes a session returns the same `UserAuthResult`, so
 * the client has one code path for "you are now signed in" regardless of how it
 * got there.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Op } from "sequelize";
import env from "@/config/env.config";
import logger, { runBackground } from "@/utils/logger.util";
import { uuid } from "@/utils/id.util";
import { nowIso } from "@/models/model_options";
import {
  AppUser,
  EmailOtp,
  PasswordHistory,
  PASSWORD_HISTORY_DEPTH,
  UserConsent,
  UserIdentity,
  UserSession,
} from "@/models/app_user.model";
import mailerService from "@/services/mailer.service";
import socialIdentityService from "@/services/social_identity.service";
import { AuthError } from "@/services/auth.service";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "@/types/admin.interface";
import type {
  AvatarMode,
  ConsentDocument,
  OtpPurpose,
  SessionSummary,
  SocialProvider,
  UpdateProfileDto,
  UserAuthResult,
  UserPreferences,
  UserProfile,
  UserRole,
  UserTokenPair,
} from "@/types/user.interface";

/**
 * A bcrypt hash of a value nobody knows.
 *
 * Compared against when the submitted email has no account, so the response time
 * of "unknown email" matches "wrong password". Without this, login timing alone
 * enumerates accounts and A10's promise is cosmetic.
 */
const DECOY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.hV3.CqRLbLuJ1v3ZQuLGzT7Q2xN0S2u";

/** Device context, taken from the request rather than trusted from the body. */
export interface DeviceContext {
  deviceLabel?: string;
  platform?: string;
}

/** Everything a consent write needs from the request. */
export interface ConsentContext {
  ipHash?: string | null;
  userAgent?: string | null;
}

class UserAuthService {
  // ── Tokens ────────────────────────────────────────────────────────────────

  private signAccessToken(user: AppUser, sessionId: string): string {
    const payload: AccessTokenPayload & { sid: string } = {
      sub: user.id,
      email: user.email,
      role: user.role,
      aud: "user",
      typ: "access",
      // The session id travels in the access token so a revoked device stops
      // working within one access-token lifetime, not one refresh cycle.
      sid: sessionId,
    };
    return jwt.sign(payload, env.jwt.accessSecret, {
      expiresIn: env.jwt.accessExpiresIn,
    } as SignOptions);
  }

  private signRefreshToken(userId: string, jti: string): string {
    const payload: RefreshTokenPayload = {
      sub: userId,
      aud: "user",
      jti,
      typ: "refresh",
    };
    return jwt.sign(payload, env.jwt.refreshSecret, {
      expiresIn: env.jwt.refreshExpiresIn,
    } as SignOptions);
  }

  /** Verify a member refresh token's signature and shape. */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
      if (decoded.typ !== "refresh") throw new AuthError("Invalid token type.", 401);
      if (decoded.aud !== "user") throw new AuthError("Invalid token audience.", 403);
      return decoded;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthError("Your session has expired. Please log in again.", 401);
      }
      throw new AuthError("Invalid refresh token.", 401);
    }
  }

  /** Open a new session for a device and issue the first token pair. */
  private async openSession(user: AppUser, device: DeviceContext): Promise<UserTokenPair> {
    const jti = uuid();
    const session = await UserSession.create({
      user_id: user.id,
      refresh_jti: jti,
      device_label: (device.deviceLabel ?? "").trim().slice(0, 120) || "Unknown device",
      platform: (device.platform ?? "unknown").trim().slice(0, 16) || "unknown",
      last_seen_at: nowIso(),
    });

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken: this.signRefreshToken(user.id, jti),
      tokenType: "Bearer",
      expiresIn: env.jwt.accessExpiresIn,
    };
  }

  // ── Profile shaping ───────────────────────────────────────────────────────

  /**
   * Derive initials for the A9 / D1 avatar tile.
   *
   * Falls back to the email's first character so the tile is never empty, and
   * never leaks more of the address than that.
   */
  private initialsFor(user: AppUser): string {
    const name = user.display_name.trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    return (user.email[0] ?? "?").toUpperCase();
  }

  private preferencesFor(user: AppUser): UserPreferences {
    return {
      anonymousByDefault: user.anonymous_by_default,
      defaultVisibility: user.default_visibility,
      defaultPrecision: user.default_precision,
      notificationsEnabled: user.notifications_enabled,
      language: user.language,
    };
  }

  /**
   * Public projection. `password_hash` is excluded by the model's default scope,
   * and no internal column is added back here.
   */
  toProfile(user: AppUser): UserProfile {
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      displayName: user.display_name,
      avatarMode: user.avatar_mode,
      // Presigned on demand by the media layer; the raw storage key never ships.
      avatarUrl: null,
      initials: this.initialsFor(user),
      role: user.role,
      hasPassword: Boolean(user.password_hash),
      preferences: this.preferencesFor(user),
      createdAt: (user.get("created_on") as Date | undefined)?.toISOString() ?? "",
    };
  }

  /** Load a member with the hash column present. */
  private async findWithSecret(email: string): Promise<AppUser | null> {
    return AppUser.scope("withSecret").findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  // ── One-time codes ────────────────────────────────────────────────────────

  /**
   * Mint a code, store its hash, and dispatch the mail in the background.
   *
   * `crypto.randomInt` rather than `Math.random`: a predictable verification code
   * is the same as no verification code.
   */
  private async issueOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const max = 10 ** env.otp.length;
    const code = String(crypto.randomInt(0, max)).padStart(env.otp.length, "0");
    const now = Date.now();

    // Supersede any outstanding code for this address and purpose, so an old
    // message cannot be used after a resend.
    await EmailOtp.update(
      { consumed_at: nowIso() },
      { where: { email: normalized, purpose, consumed_at: null } },
    );

    await EmailOtp.create({
      email: normalized,
      purpose,
      code_hash: await bcrypt.hash(code, env.bcryptSaltRounds),
      expires_at: new Date(now + env.otp.ttlSeconds * 1000).toISOString(),
      sent_at: new Date(now).toISOString(),
    });

    // Background, so the endpoint's response time is the same whether or not an
    // address exists. See the file header.
    runBackground(
      purpose === "verify_email"
        ? mailerService.sendVerificationCode(normalized, code)
        : mailerService.sendPasswordResetCode(normalized, code),
      `${purpose} email`,
    );
  }

  /** Seconds a caller must wait before a resend is accepted. */
  private async resendWaitSeconds(email: string, purpose: OtpPurpose): Promise<number> {
    const latest = await EmailOtp.findOne({
      where: { email: email.trim().toLowerCase(), purpose },
      order: [["sent_at", "DESC"]],
    });
    if (!latest) return 0;
    const elapsed = (Date.now() - Date.parse(latest.sent_at)) / 1000;
    return Math.max(0, Math.ceil(env.otp.resendCooldownSeconds - elapsed));
  }

  /**
   * Check a submitted code and consume it.
   *
   * The attempt counter is incremented before the comparison, so a caller cannot
   * get a free guess by racing two requests. Every failure returns the same
   * message: distinguishing "expired" from "wrong" from "too many attempts" tells
   * an attacker which lever to pull.
   */
  private async consumeOtp(email: string, purpose: OtpPurpose, code: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const record = await EmailOtp.findOne({
      where: { email: normalized, purpose, consumed_at: null },
      order: [["sent_at", "DESC"]],
    });

    const invalid = new AuthError("That code is not valid. Request a new one.", 400);
    if (!record) throw invalid;

    if (Date.parse(record.expires_at) < Date.now()) {
      await record.update({ consumed_at: nowIso() });
      throw invalid;
    }
    if (record.attempts >= env.otp.maxAttempts) {
      await record.update({ consumed_at: nowIso() });
      throw invalid;
    }

    await record.increment("attempts");
    const matches = await bcrypt.compare(code, record.code_hash);
    if (!matches) throw invalid;

    await record.update({ consumed_at: nowIso() });
  }

  // ── Registration and verification ─────────────────────────────────────────

  /**
   * Screen A6 → A8. Create an unverified account and send a code.
   *
   * An existing **unverified** account is re-issued a code rather than rejected —
   * the common case is someone who abandoned the flow and came back. An existing
   * **verified** account also returns success without sending anything, because
   * telling the caller "that email is taken" is exactly the disclosure A10 and
   * A13 are written to avoid.
   */
  async register(email: string, password: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.findWithSecret(normalized);

    if (existing && existing.email_verified_at) {
      logger.info("[user-auth] register on an existing verified account", {
        userId: existing.id,
      });
      return;
    }

    if (existing) {
      // Unverified: adopt the new password and re-send.
      existing.password_hash = password;
      await existing.save();
    } else {
      await AppUser.create({ email: normalized, password_hash: password });
    }

    await this.issueOtp(normalized, "verify_email");
  }

  /** Screen A8. Accept the code, mark the account verified, and open a session. */
  async verifyEmail(
    email: string,
    code: string,
    device: DeviceContext,
  ): Promise<UserAuthResult> {
    const normalized = email.trim().toLowerCase();
    await this.consumeOtp(normalized, "verify_email", code);

    const user = await this.findWithSecret(normalized);
    if (!user) throw new AuthError("That code is not valid. Request a new one.", 400);
    if (user.status !== "active") {
      throw new AuthError("This account is not available.", 403);
    }

    if (!user.email_verified_at) {
      await user.update({ email_verified_at: nowIso() });
    }
    await user.update({ last_login_at: nowIso() });

    // Seed the history so A14's "not a password you have used here before" is
    // true from the first reset onward.
    if (user.password_hash) {
      await this.recordPasswordHistory(user.id, user.password_hash);
    }

    const tokens = await this.openSession(user, device);
    return { user: this.toProfile(user), tokens };
  }

  /** Screens A8 / A14. Re-send a code, subject to the cooldown. */
  async resendCode(email: string, purpose: OtpPurpose): Promise<number> {
    const normalized = email.trim().toLowerCase();
    const wait = await this.resendWaitSeconds(normalized, purpose);
    if (wait > 0) return wait;

    // Only send if it would be meaningful, but return the same value either way.
    const user = await AppUser.findOne({ where: { email: normalized } });
    const shouldSend =
      purpose === "verify_email"
        ? Boolean(user) && !user?.email_verified_at
        : Boolean(user) && user?.status === "active";

    if (shouldSend) await this.issueOtp(normalized, purpose);
    return env.otp.resendCooldownSeconds;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  /**
   * Screen A10.
   *
   * One message — "That email and password don't match." — for a wrong password,
   * an unknown address, and an unverified account. The decoy comparison keeps the
   * timing of the unknown-address path in line with the others.
   */
  async login(email: string, password: string, device: DeviceContext): Promise<UserAuthResult> {
    const generic = new AuthError("That email and password don't match.", 401);
    const user = await this.findWithSecret(email);

    if (!user || !user.password_hash) {
      await bcrypt.compare(password, DECOY_HASH);
      throw generic;
    }
    if (user.status !== "active") {
      await bcrypt.compare(password, DECOY_HASH);
      throw generic;
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      logger.warn("[user-auth] failed login", { userId: user.id });
      throw generic;
    }

    // An unverified account is indistinguishable from a wrong password here, so a
    // half-finished sign-up cannot be probed. The client recovers by re-running
    // the A6 → A8 flow, which re-issues a code for exactly this state.
    if (!user.email_verified_at) throw generic;

    await user.update({ last_login_at: nowIso() });
    const tokens = await this.openSession(user, device);
    return { user: this.toProfile(user), tokens };
  }

  /**
   * Screen A5 — Continue with Apple / Google.
   *
   * The provider's identity token is verified against its JWKS before anything is
   * trusted, then the account is resolved by provider subject first and verified
   * email second. Email is the *fallback*, because Apple's private relay means the
   * address can differ from what the person believes it is, while the subject is
   * stable forever.
   *
   * A social sign-in implies a verified email — the provider has already done that
   * work — so the A8 step is skipped.
   */
  async socialLogin(
    provider: SocialProvider,
    identityToken: string,
    fullName: string | undefined,
    device: DeviceContext,
  ): Promise<UserAuthResult> {
    const identity = await socialIdentityService.verify(provider, identityToken);

    const linked = await UserIdentity.findOne({
      where: { provider, provider_subject: identity.subject },
    });

    let user: AppUser | null = null;

    if (linked) {
      user = await AppUser.scope("withSecret").findByPk(linked.user_id);
    } else if (identity.email) {
      user = await this.findWithSecret(identity.email);
    }

    if (!user) {
      if (!identity.email) {
        throw new AuthError(
          "That account did not share an email address, so it cannot be used to sign in.",
          400,
        );
      }
      user = await AppUser.create({
        email: identity.email,
        // Provider-verified, so no A8 round trip.
        email_verified_at: nowIso(),
        display_name: (fullName ?? "").trim().slice(0, 120),
      });
    }

    if (user.status !== "active") {
      throw new AuthError("This account is not available.", 403);
    }

    // A provider-verified address verifies an account that signed up by email and
    // never finished — the proof is equivalent.
    if (!user.email_verified_at) {
      await user.update({ email_verified_at: nowIso() });
    }
    // The provider's address can change between sign-ins, and Apple's changes for
    // a specific reason: switching "Hide My Email" to "Share My Email" replaces a
    // `@privaterelay.appleid.com` forwarder with the person's real inbox. The
    // account is found by `provider_subject`, so nothing above notices — without
    // this the stored address stays frozen at whatever the first sign-in produced,
    // and every code we send keeps going to the relay (or nowhere, if our sender
    // is not registered with Apple).
    //
    // Only moved when the provider says the new address is verified, and only onto
    // an address no one else holds — `email` is the login identifier, so silently
    // taking one that belongs to another account would merge two people.
    if (identity.email && identity.email !== user.email) {
      const conflict = await this.findWithSecret(identity.email);
      if (conflict && conflict.id !== user.id) {
        logger.warn("[auth] provider email already belongs to another account", {
          provider,
          userId: user.id,
        });
      } else {
        await user.update({ email: identity.email, email_verified_at: nowIso() });
      }
    }
    // Apple returns the name only on first authorisation; capture it if we have
    // nothing better.
    if (!user.display_name && fullName) {
      await user.update({ display_name: fullName.trim().slice(0, 120) });
    }

    if (!linked) {
      await UserIdentity.create({
        user_id: user.id,
        provider,
        provider_subject: identity.subject,
        provider_email: identity.email ?? null,
        provider_email_is_private: identity.isPrivateEmail,
        linked_at: nowIso(),
      });
    } else if (
      // Keep the link's own record of what the provider last reported. It is not
      // used for lookup, but it is what support reads to answer "why did their
      // code never arrive" — a stale relay address here hides the answer.
      linked.provider_email !== (identity.email ?? null) ||
      linked.provider_email_is_private !== identity.isPrivateEmail
    ) {
      await linked.update({
        provider_email: identity.email ?? null,
        provider_email_is_private: identity.isPrivateEmail,
      });
    }

    await user.update({ last_login_at: nowIso() });
    const tokens = await this.openSession(user, device);
    return { user: this.toProfile(user), tokens };
  }

  // ── Refresh, logout ───────────────────────────────────────────────────────

  /**
   * Rotate a refresh token.
   *
   * The presented `jti` must match the session row's current value, so a replayed
   * token fails even with a valid signature. A mismatch is logged: it is either a
   * stolen token or a client with a race, and both are worth seeing.
   */
  async refresh(refreshToken: string): Promise<UserAuthResult> {
    const decoded = this.verifyRefreshToken(refreshToken);

    const session = await UserSession.findOne({
      where: { user_id: decoded.sub, refresh_jti: decoded.jti, revoked_at: null },
    });
    if (!session) {
      logger.warn("[user-auth] refresh replay or revoked session", { userId: decoded.sub });
      throw new AuthError("Your session has ended. Please log in again.", 401);
    }

    const user = await AppUser.scope("withSecret").findByPk(decoded.sub);
    if (!user || user.status !== "active") {
      await session.update({ revoked_at: nowIso() });
      throw new AuthError("This account is no longer active.", 403);
    }

    const nextJti = uuid();
    await session.update({ refresh_jti: nextJti, last_seen_at: nowIso() });

    return {
      user: this.toProfile(user),
      tokens: {
        accessToken: this.signAccessToken(user, session.id),
        refreshToken: this.signRefreshToken(user.id, nextJti),
        tokenType: "Bearer",
        expiresIn: env.jwt.accessExpiresIn,
      },
    };
  }

  /** Revoke one session — the device that asked. */
  async logout(userId: string, sessionId?: string): Promise<void> {
    if (!sessionId) return;
    await UserSession.update(
      { revoked_at: nowIso(), push_token: null },
      { where: { id: sessionId, user_id: userId, revoked_at: null } },
    );
  }

  /** Revoke every session, optionally sparing one. Backs A15 and "sign out everywhere". */
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
    const where: Record<string, unknown> = { user_id: userId, revoked_at: null };
    if (exceptSessionId) where.id = { [Op.ne]: exceptSessionId };
    const [count] = await UserSession.update(
      { revoked_at: nowIso(), push_token: null },
      { where },
    );
    return count;
  }

  /** Profile → Security. `current` marks the session making the request. */
  async listSessions(userId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    const rows = await UserSession.findAll({
      where: { user_id: userId, revoked_at: null },
      order: [["last_seen_at", "DESC"]],
    });
    return rows.map((row) => ({
      id: row.id,
      deviceLabel: row.device_label,
      platform: row.platform,
      lastSeenAt: row.last_seen_at,
      createdAt: (row.get("created_on") as Date | undefined)?.toISOString() ?? "",
      current: row.id === currentSessionId,
    }));
  }

  // ── Password reset ────────────────────────────────────────────────────────

  /**
   * Screen A13.
   *
   * Returns the same value for a registered and an unregistered address, and does
   * the mail dispatch in the background so the two are indistinguishable by
   * timing as well as by content. The screen's copy — "If an account exists for
   * this address, a code is on its way. We don't say whether one does." — is only
   * true if this method keeps that promise.
   */
  async forgotPassword(email: string): Promise<{ resendAfterSeconds: number }> {
    const normalized = email.trim().toLowerCase();
    const wait = await this.resendWaitSeconds(normalized, "reset_password");
    if (wait > 0) return { resendAfterSeconds: wait };

    const user = await AppUser.findOne({ where: { email: normalized } });
    if (user && user.status === "active") {
      await this.issueOtp(normalized, "reset_password");
    }
    return { resendAfterSeconds: env.otp.resendCooldownSeconds };
  }

  private async recordPasswordHistory(userId: string, hash: string): Promise<void> {
    await PasswordHistory.create({ user_id: userId, password_hash: hash });
    const stale = await PasswordHistory.findAll({
      where: { user_id: userId },
      order: [["created_on", "DESC"]],
      offset: PASSWORD_HISTORY_DEPTH,
    });
    if (stale.length > 0) {
      await PasswordHistory.destroy({ where: { id: stale.map((row) => row.id) } });
    }
  }

  /** A14's third requirement row: not a password used here before. */
  private async isReusedPassword(userId: string, candidate: string): Promise<boolean> {
    const history = await PasswordHistory.findAll({
      where: { user_id: userId },
      order: [["created_on", "DESC"]],
      limit: PASSWORD_HISTORY_DEPTH,
    });
    for (const row of history) {
      if (await bcrypt.compare(candidate, row.password_hash)) return true;
    }
    return false;
  }

  /**
   * Screens A14 → A15.
   *
   * Sets the new password, then revokes every session except the one this call
   * opens — which is exactly what A15 tells the user has happened: "You're logged
   * in on this device. Every other device has been signed out."
   */
  async resetPassword(
    email: string,
    code: string,
    password: string,
    device: DeviceContext,
  ): Promise<UserAuthResult> {
    const normalized = email.trim().toLowerCase();
    await this.consumeOtp(normalized, "reset_password", code);

    const user = await this.findWithSecret(normalized);
    if (!user || user.status !== "active") {
      throw new AuthError("That code is not valid. Request a new one.", 400);
    }

    if (await this.isReusedPassword(user.id, password)) {
      throw new AuthError("Choose a password you have not used here before.", 400);
    }

    user.password_hash = password;
    // A reset proves control of the mailbox, so it also verifies the address.
    if (!user.email_verified_at) user.email_verified_at = nowIso();
    await user.save();
    await this.recordPasswordHistory(user.id, user.password_hash);

    // Open this device's session first, then revoke the others, so the caller is
    // never momentarily signed out of everything.
    const tokens = await this.openSession(user, device);
    const decoded = jwt.decode(tokens.accessToken) as { sid?: string } | null;
    const revoked = await this.revokeAllSessions(user.id, decoded?.sid);
    logger.info("[user-auth] password reset", { userId: user.id, sessionsRevoked: revoked });

    return { user: this.toProfile(user), tokens };
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await AppUser.scope("withSecret").findByPk(userId);
    return user ? this.toProfile(user) : null;
  }

  /** Screen A9 and Profile → Defaults. Only the listed fields are writable. */
  async updateProfile(userId: string, patch: UpdateProfileDto): Promise<UserProfile> {
    const user = await AppUser.scope("withSecret").findByPk(userId);
    if (!user) throw new AuthError("Account not found.", 404);

    const updates: Record<string, unknown> = {};
    if (patch.displayName !== undefined) {
      updates.display_name = patch.displayName.trim().slice(0, 120);
    }
    if (patch.avatarMode !== undefined) updates.avatar_mode = patch.avatarMode as AvatarMode;
    if (patch.anonymousByDefault !== undefined) {
      updates.anonymous_by_default = patch.anonymousByDefault;
    }
    if (patch.defaultVisibility !== undefined) {
      updates.default_visibility = patch.defaultVisibility;
    }
    if (patch.defaultPrecision !== undefined) {
      updates.default_precision = patch.defaultPrecision;
    }
    if (patch.notificationsEnabled !== undefined) {
      updates.notifications_enabled = patch.notificationsEnabled;
    }
    if (patch.language !== undefined) updates.language = patch.language;

    if (Object.keys(updates).length > 0) await user.update(updates);
    return this.toProfile(user);
  }

  /** Screen A7. One row per acceptance — never an update. */
  async recordConsents(
    userId: string,
    documents: ConsentDocument[],
    version: number,
    context: ConsentContext,
  ): Promise<void> {
    const agreedAt = nowIso();
    await UserConsent.bulkCreate(
      documents.map((document) => ({
        user_id: userId,
        document,
        version,
        agreed_at: agreedAt,
        ip_hash: context.ipHash ?? null,
        user_agent: context.userAgent?.slice(0, 512) ?? null,
      })),
    );
  }

  /** Whether the member has accepted both documents at or above `version`. */
  async hasCurrentConsents(userId: string, version: number): Promise<boolean> {
    const rows = await UserConsent.findAll({
      where: { user_id: userId, version: { [Op.gte]: version } },
      attributes: ["document"],
    });
    const documents = new Set(rows.map((row) => row.document));
    return documents.has("tos") && documents.has("privacy");
  }

  /**
   * Screen A11. Store the Expo push token on the calling session.
   *
   * Per session, not per user, so revoking a device stops its pushes as a
   * side effect of revoking its session rather than as a separate cleanup step.
   */
  async registerPushToken(
    userId: string,
    sessionId: string | undefined,
    pushToken: string,
  ): Promise<void> {
    if (!sessionId) return;
    // A token can migrate between installs; clear it anywhere else first so a
    // push is never delivered twice.
    await UserSession.update(
      { push_token: null },
      { where: { push_token: pushToken, id: { [Op.ne]: sessionId } } },
    );
    await UserSession.update(
      { push_token: pushToken, last_seen_at: nowIso() },
      { where: { id: sessionId, user_id: userId } },
    );
  }

  /**
   * Grant a member role — currently only `advocate`, which unlocks Trusted Circle
   * reading. Called by an operator, never reachable from a member route.
   */
  async setRole(userId: string, role: UserRole): Promise<void> {
    await AppUser.update({ role }, { where: { id: userId } });
  }

  // ── Confirming an irreversible action ──────────────────────────────────────

  /**
   * Send the six-digit code that confirms an account deletion.
   *
   * Only meaningful for accounts with no password — Apple- and Google-only sign-ins
   * have nothing to re-type, and "are you sure?" is not proof of anything. Issued
   * to the address on file rather than one supplied in the request, so a stolen
   * token cannot redirect the confirmation somewhere the owner will not see it.
   */
  async issueDeletionCode(userId: string): Promise<void> {
    const user = await AppUser.findByPk(userId);
    if (!user) throw new AuthError("That account no longer exists.", 404);
    await this.issueOtp(user.email, "confirm_deletion");
  }

  /**
   * Prove the person at the keyboard is the account holder, immediately before an
   * irreversible action.
   *
   * A valid access token is not enough on its own here. Every other destructive
   * thing in the app can be undone — a deleted report sits in a 30-day window, a
   * revoked session can be replaced — so a borrowed unlocked phone costs the owner
   * nothing permanent. This one cannot be undone, so it asks again.
   *
   * Which proof is accepted depends on what the account actually has:
   *   • a password set  → the password, compared with bcrypt
   *   • no password set → a fresh `confirm_deletion` code from `issueDeletionCode`
   *
   * The error names which one is expected, because a screen that says "wrong
   * password" to someone who has never set one is a dead end.
   */
  async assertDeletionConfirmed(
    userId: string,
    proof: { password?: string; code?: string },
  ): Promise<void> {
    const user = await AppUser.scope("withSecret").findByPk(userId);
    if (!user) throw new AuthError("That account no longer exists.", 404);

    if (user.password_hash) {
      if (!proof.password) {
        throw new AuthError("Enter your password to confirm.", 400);
      }
      const matches = await bcrypt.compare(proof.password, user.password_hash);
      if (!matches) throw new AuthError("That password is not right.", 401);
      return;
    }

    if (!proof.code) {
      throw new AuthError(
        "This account signs in with Apple or Google, so we need a code from your email to confirm.",
        400,
      );
    }
    await this.consumeOtp(user.email, "confirm_deletion", proof.code);
  }
}

export const userAuthService = new UserAuthService();
export default userAuthService;
