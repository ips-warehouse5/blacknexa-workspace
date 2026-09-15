/**
 * Password recovery endpoints.
 *
 * Kept apart from `auth.api` because these are unauthenticated and behave
 * differently on failure: recovery answers the same way whether or not the
 * account exists, while sign-in is allowed to say a credential was wrong.
 */

import { apiPost } from "@/lib/http";

const BASE = "/admin/auth/password";

export const recoveryApi = {
  /**
   * Request a reset code.
   *
   * Resolves even for an unknown address — the API returns success either way,
   * so that this endpoint cannot be used to enumerate administrator accounts.
   */
  requestReset(email: string): Promise<null> {
    return apiPost<null>(`${BASE}/forgot`, { email });
  },

  /**
   * Consume a reset code and set a new password.
   *
   * The API revokes every refresh token for the account as part of this, so a
   * reset also ends any session an attacker may already hold.
   */
  resetPassword(input: { email: string; code: string; password: string }): Promise<null> {
    return apiPost<null>(`${BASE}/reset`, input);
  },
};

export default recoveryApi;
