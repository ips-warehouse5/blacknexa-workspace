/**
 * Admin/auth types.
 *
 * The Worker had no authentication of any kind. The mobile apps authenticate
 * against an external Rork OAuth host and hold no token for this API, so adding
 * a guard to a public read path would break them immediately.
 *
 * This surface therefore exists to protect the destructive and operational
 * routes — daily refresh, backfills, duplicate pruning, cache/queue admin,
 * payout status transitions, and persistence restore — which were previously
 * callable by anyone who knew the URL, and to back the admin console.
 */

import type { UserRole } from "@/types/user.interface";

/**
 * Operator roles.
 *
 * Four, fixed. This replaces the earlier five-role set
 * (`super-admin | admin | editor | auditor | moderator`), which had grown from
 * what individual routes happened to need rather than from how the organisation
 * actually works. The console ships four roles and the same four keys are used
 * here, so a token maps onto a console role with no translation table — and
 * there is exactly one place to read to find out what a role can do.
 *
 * Mapping applied to the routes that used the old set:
 *   super-admin, admin, editor, auditor → superadmin
 *   moderator                           → moderator
 * `advocate` and `staff` are new, and hold no operational route permissions.
 */
export type AdminRole = "superadmin" | "moderator" | "advocate" | "staff";

export const ALL_ADMIN_ROLES: AdminRole[] = [
  "superadmin",
  "moderator",
  "advocate",
  "staff",
];

/** Display names, used in responses and email copy. */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "Super Admin",
  moderator: "Moderator",
  advocate: "Advocate",
  staff: "Support Staff",
};

/**
 * Any role a token can carry.
 *
 * The two role sets are deliberately disjoint and are never interchangeable: the
 * `aud` claim decides which set applies, and `checkRole` still accepts only
 * `AdminRole`, so widening this union cannot accidentally let a member role
 * satisfy an operator route.
 */
export type ActorRole = AdminRole | UserRole;

/** Token audience — distinguishes an operator token from an app-user token. */
export type TokenAudience = "admin" | "user";

/** Access-token claims. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: ActorRole;
  aud: TokenAudience;
  /** Token type discriminator so a refresh token can never be used as an access token. */
  typ: "access";
}

/**
 * Refresh-token claims.
 *
 * `jti` allows rotation and revocation. For an operator it is matched against the
 * single `admin_users.refresh_token_id` column; for a member it is matched against
 * a row in `user_sessions`, because screen A15 promises "every other device has
 * been signed out" while this one stays — which one column cannot express.
 */
export interface RefreshTokenPayload {
  sub: string;
  aud: TokenAudience;
  jti: string;
  typ: "refresh";
}

/** What `req.user` carries once a guard has run. */
export interface AuthenticatedActor {
  id: string;
  email: string;
  role: ActorRole;
  audience: TokenAudience;
  /** Present on member tokens: the `user_sessions` row this request came from. */
  sessionId?: string;
}

/** Public (password-free) admin representation. */
export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** Two-letter monogram, derived from the name for the console sidebar. */
  avatar: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

export interface LoginResult {
  admin: AdminProfile;
  tokens: TokenPair;
}

/**
 * What a successful first factor returns.
 *
 * Deliberately carries no tokens. Passing the password earns a challenge and
 * nothing else; the session is issued only by `/mfa/verify`. That is what makes
 * the second factor mandatory rather than advisory — there is no response shape
 * in which a password alone produces a session.
 */
export interface MfaChallengeResult {
  challengeId: string;
  /** Partially masked, so the screen can say where the code went. */
  email: string;
  codeLength: number;
  resendAfterSeconds: number;
  expiresInSeconds: number;
  /** Development only — omitted when `NODE_ENV=production`. */
  devCode?: string;
}

export interface MfaVerifyDto {
  challengeId: string;
  code: string;
}

export interface MfaResendDto {
  challengeId: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  password: string;
}
