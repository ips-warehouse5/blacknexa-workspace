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

/** Roles recognised by `checkRole`. */
export type AdminRole = "super-admin" | "admin" | "editor" | "auditor";

export const ALL_ADMIN_ROLES: AdminRole[] = ["super-admin", "admin", "editor", "auditor"];

/** Token audience — distinguishes an operator token from a future app-user token. */
export type TokenAudience = "admin" | "user";

/** Access-token claims. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AdminRole;
  aud: TokenAudience;
  /** Token type discriminator so a refresh token can never be used as an access token. */
  typ: "access";
}

/** Refresh-token claims. `jti` allows rotation/revocation. */
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
  role: AdminRole;
  audience: TokenAudience;
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
