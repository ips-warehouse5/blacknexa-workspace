/**
 * The authentication endpoints.
 *
 * Sign-in is deliberately two calls. `login` proves the password and returns a
 * challenge; `verifyMfa` proves possession of the emailed code and is the only
 * call that returns tokens. Splitting them this way means a leaked password on
 * its own buys nothing — there is no response shape in which the first call
 * hands back a session.
 */

import { apiGet, apiPost } from "@/lib/http";
import { getRefreshToken } from "@/lib/token-storage";
import type {
  AdminProfile,
  AuthSession,
  LoginCredentials,
  MfaChallenge,
  MfaVerifyInput,
} from "@/types/auth";

const BASE = "/admin/auth";

export const authApi = {
  /** First factor. Returns the challenge to satisfy, never a session. */
  login({ email, password }: LoginCredentials): Promise<MfaChallenge> {
    return apiPost<MfaChallenge>(`${BASE}/login`, { email, password });
  },

  /** Second factor. Issues the token pair. */
  verifyMfa(input: MfaVerifyInput): Promise<AuthSession> {
    return apiPost<AuthSession>(`${BASE}/mfa/verify`, input);
  },

  /** Reissue the code. Returns a replacement challenge, not the original. */
  resendMfaCode(challengeId: string): Promise<MfaChallenge> {
    return apiPost<MfaChallenge>(`${BASE}/mfa/resend`, { challengeId });
  },

  /**
   * Exchange the stored refresh token for a new session.
   *
   * Used on page load rather than on 401 — the interceptor in `lib/http` owns
   * the 401 path, because it also has to hold concurrent requests while the
   * rotation completes.
   */
  refresh(): Promise<AuthSession> {
    const refreshToken = getRefreshToken();
    return apiPost<AuthSession>(`${BASE}/refresh`, { refreshToken });
  },

  /** Revoke the refresh token server-side. */
  logout(): Promise<null> {
    return apiPost<null>(`${BASE}/logout`);
  },

  /** The signed-in operator's own profile. */
  me(): Promise<AdminProfile> {
    return apiGet<AdminProfile>(`${BASE}/me`);
  },
};

export default authApi;
