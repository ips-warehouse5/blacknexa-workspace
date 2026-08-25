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
 * callable by anyone who knew the URL.
 */

import type { UserRole } from "@/types/user.interface";

/**
 * Roles recognised by `checkRole`.
 *
 * `moderator` lives here rather than with the member roles. Moderation is an
 * operational function: every decision writes an actor id onto a report's
 * timeline, and that actor has to be an account an administrator can grant and
 * revoke. Making it a member role would also blur the two token audiences, which
 * are deliberately disjoint.
 */
export type AdminRole = "super-admin" | "admin" | "editor" | "auditor" | "moderator";

export const ALL_ADMIN_ROLES: AdminRole[] = [
  "super-admin",
  "admin",
  "editor",
  "auditor",
  "moderator",
];

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
