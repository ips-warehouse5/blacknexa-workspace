/**
 * Authentication and session shapes.
 *
 * Sign-in is two steps — credentials, then a one-time code — so the states
 * between "typed a password" and "signed in" need names of their own. Modelling
 * them explicitly keeps the login screen a function of state rather than a set
 * of booleans that can contradict each other.
 */

import type { RoleKey } from "@/types/rbac";

/** The signed-in operator, as the console knows them. */
export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  /** Two-letter monogram for the sidebar. Derived server-side from the name. */
  avatar: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Access/refresh pair returned once the second factor is satisfied. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** Access-token lifetime, as the server describes it (e.g. "15m"). */
  expiresIn: string;
}

/**
 * What `POST /admin/auth/login` returns.
 *
 * Note that it carries no tokens. Passing the first factor only earns a
 * short-lived challenge id; the session is issued by `/mfa/verify`. Keeping
 * tokens out of this response is what makes the second factor mandatory rather
 * than advisory.
 */
export interface MfaChallenge {
  challengeId: string;
  /** Partially masked, for "we sent a code to j•••@blacknexa.com". */
  email: string;
  /** Digits expected in the code. Drives how many inputs are rendered. */
  codeLength: number;
  /** Seconds before a new code may be requested. */
  resendAfterSeconds: number;
  /** Seconds before the challenge itself expires. */
  expiresInSeconds: number;
  /**
   * Development only: the code the server generated. The API omits this
   * outside development, so the UI must treat it as usually absent.
   */
  devCode?: string;
}

/** What `POST /admin/auth/mfa/verify` returns. */
export interface AuthSession {
  admin: AdminProfile;
  tokens: TokenPair;
}

export interface LoginCredentials {
  email: string;
  password: string;
  /**
   * Whether the session should outlive the tab. Chooses between localStorage
   * and sessionStorage for the refresh token — see `lib/token-storage.ts`.
   */
  remember: boolean;
}

export interface MfaVerifyInput {
  challengeId: string;
  code: string;
}
