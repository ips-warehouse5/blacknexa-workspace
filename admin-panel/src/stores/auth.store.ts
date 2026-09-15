/**
 * Session state.
 *
 * The signed-in operator lives here rather than in React Query because it is
 * not a cache: there is exactly one, it never goes stale in a way a refetch
 * would fix, and half the app reads it on every render to decide what to show.
 *
 * Everything the console renders about permissions derives from `admin.role`,
 * so this store is the client-side root of RBAC — which is worth stating plainly
 * because it is also why none of it is security. The API re-checks every call.
 */

import { create } from "zustand";

import { authApi } from "@/features/auth/auth.api";
import { installSessionExpiryHandler } from "@/lib/http";
import {
  clearTokens,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  wasRemembered,
} from "@/lib/token-storage";
import type { AdminProfile, AuthSession, LoginCredentials, MfaChallenge } from "@/types/auth";
import type { NavSection, Permission } from "@/types/rbac";
import { roleCan, roleCanNavigate } from "@/lib/rbac";

/**
 * Where sign-in has got to.
 *
 * `restoring` is the state on first paint, before the stored refresh token has
 * been exchanged. It exists to stop the router redirecting a signed-in operator
 * to the login screen for the one frame before their session comes back.
 */
export type AuthStatus = "restoring" | "anonymous" | "awaitingMfa" | "authenticated";

interface AuthState {
  status: AuthStatus;
  admin: AdminProfile | null;

  /** The outstanding second-factor challenge, while `status` is "awaitingMfa". */
  challenge: MfaChallenge | null;

  /**
   * Held between the two sign-in steps so the token can be persisted to the
   * right store once the challenge is met. Not the password — only the choice.
   */
  rememberMe: boolean;

  /** Why the session ended, shown on the login screen after an expiry. */
  expiryNotice: string | null;

  login: (credentials: LoginCredentials) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  resendMfaCode: () => Promise<void>;
  cancelMfa: () => void;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  clearExpiryNotice: () => void;

  can: (permission: Permission) => boolean;
  canNavigate: (section: NavSection) => boolean;
}

/**
 * The in-flight session restore, if one is running.
 *
 * Module-level rather than store state: it is a concurrency guard, not
 * something any component renders, and keeping it out of the store means a
 * subscriber cannot re-render because of it.
 */
let restoreInFlight: Promise<void> | null = null;

/** Apply a completed sign-in: persist tokens, adopt the profile. */
function adoptSession(session: AuthSession, remember: boolean): Pick<AuthState, "status" | "admin" | "challenge"> {
  setAccessToken(session.tokens.accessToken);
  setRefreshToken(session.tokens.refreshToken, remember);
  return { status: "authenticated", admin: session.admin, challenge: null };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "restoring",
  admin: null,
  challenge: null,
  rememberMe: wasRemembered(),
  expiryNotice: null,

  /**
   * First factor. Succeeding here does not sign anyone in — it returns a
   * challenge and parks the session in `awaitingMfa`.
   */
  async login(credentials) {
    const challenge = await authApi.login(credentials);
    set({ status: "awaitingMfa", challenge, rememberMe: credentials.remember, expiryNotice: null });
  },

  /** Second factor. This is the call that actually issues tokens. */
  async verifyMfa(code) {
    const { challenge, rememberMe } = get();
    if (!challenge) throw new Error("There is no sign-in in progress.");

    const session = await authApi.verifyMfa({ challengeId: challenge.challengeId, code });
    set(adoptSession(session, rememberMe));
  },

  /**
   * Ask for a fresh code.
   *
   * The server issues a new challenge id, so the old one is replaced rather
   * than kept — reusing it would verify against a code that is no longer valid.
   */
  async resendMfaCode() {
    const { challenge } = get();
    if (!challenge) return;
    const next = await authApi.resendMfaCode(challenge.challengeId);
    set({ challenge: next });
  },

  /** Back out of the second step and return to the credentials form. */
  cancelMfa() {
    set({ status: "anonymous", challenge: null });
  },

  /**
   * Sign out.
   *
   * The server call is best-effort: if it fails, the local session is still
   * discarded. Leaving an operator signed in because the network hiccuped
   * during logout is the worse outcome of the two.
   */
  async logout() {
    try {
      await authApi.logout();
    } catch {
      // Ignored deliberately — see above.
    }
    clearTokens();
    set({ status: "anonymous", admin: null, challenge: null, expiryNotice: null });
  },

  /**
   * Rebuild the session on page load from the stored refresh token.
   *
   * Runs before the router renders anything. Any failure is treated as "not
   * signed in" rather than surfaced: a reload landing on the login screen is
   * understandable, an error page is not.
   *
   * Concurrent calls share one attempt. This is not a micro-optimisation — it
   * is required for correctness. Refreshing *rotates* the token server-side, so
   * a second call carrying the same one is rejected as a replay and clears the
   * session. React StrictMode invokes the mount effect twice in development,
   * which is exactly that situation, and it would sign the operator out on
   * every reload.
   */
  async restore() {
    restoreInFlight ??= (async () => {
      if (!getRefreshToken()) {
        set({ status: "anonymous" });
        return;
      }
      try {
        const session = await authApi.refresh();
        set(adoptSession(session, wasRemembered()));
      } catch {
        clearTokens();
        set({ status: "anonymous", admin: null });
      }
    })().finally(() => {
      restoreInFlight = null;
    });

    return restoreInFlight;
  },

  clearExpiryNotice() {
    set({ expiryNotice: null });
  },

  can(permission) {
    return roleCan(get().admin?.role, permission);
  },

  canNavigate(section) {
    return roleCanNavigate(get().admin?.role, section);
  },
}));

/**
 * When the HTTP layer gives up on a session, reflect that in the store.
 *
 * Registered at module load so it is in place before the first request. The
 * notice is what turns a silent redirect into an explanation on the login form.
 */
installSessionExpiryHandler(() => {
  const { status } = useAuthStore.getState();
  if (status === "anonymous") return;
  useAuthStore.setState({
    status: "anonymous",
    admin: null,
    challenge: null,
    expiryNotice: "Your session has ended. Please sign in again.",
  });
});

// ── Selectors ───────────────────────────────────────────────────────────────
// Subscribing to one field rather than the whole store keeps a component from
// re-rendering when an unrelated part of the session changes.

export const useAdmin = () => useAuthStore((s) => s.admin);
export const useAuthStatus = () => useAuthStore((s) => s.status);
export const useIsAuthenticated = () => useAuthStore((s) => s.status === "authenticated");
export const useRole = () => useAuthStore((s) => s.admin?.role ?? null);
