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
import { queryClient } from "@/lib/query-client";
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

/*
 * The operator whose data the React Query cache may be holding (review Q1).
 *
 * What the API returns depends on who asked: a Super Admin's incident detail
 * carries an anonymous reporter's name and email and the exact coordinates, an
 * unassigned advocate's does not exist at all. The query keys do not carry the
 * operator's id, and cached data outlives the component that fetched it (5 min
 * `gcTime`, and 30 s during which it is served without a refetch). So when one
 * operator signs out and another signs in on the same tab — and the login
 * screen sends them straight back to the page the first one was on — the
 * second would be shown the first one's copy until a refetch replaced it.
 *
 * The cache is therefore emptied whenever the session ends (logout, expiry),
 * and again on sign-in when the incoming operator is not the one the cache was
 * filled for — the belt-and-braces case for a session that ended without
 * passing through either path. Clearing rather than keying every query on the
 * admin id: nothing cached for one operator is worth keeping for another, and a
 * key someone forgets to extend would leak silently.
 */
let cacheOwnerId: string | null = null;

/** Drop every cached response. Called after the store has gone anonymous. */
function forgetCachedData(): void {
  cacheOwnerId = null;
  // Also cancels in-flight fetches, so a response for the old operator that
  // lands after this point is not written back into the cache.
  queryClient.clear();
}

/** Apply a completed sign-in: persist tokens, adopt the profile. */
function adoptSession(session: AuthSession, remember: boolean): Pick<AuthState, "status" | "admin" | "challenge"> {
  setAccessToken(session.tokens.accessToken);
  setRefreshToken(session.tokens.refreshToken, remember);
  if (cacheOwnerId !== session.admin.id) queryClient.clear();
  cacheOwnerId = session.admin.id;
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
    // Anonymous first, so the protected screens unmount on the next render
    // instead of re-subscribing to the emptied cache and refetching without a
    // token; then the cache is emptied before anyone else can sign in (Q1).
    set({ status: "anonymous", admin: null, challenge: null, expiryNotice: null });
    forgetCachedData();
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
        forgetCachedData();
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
  // The login screen returns the next operator to this page; they must not be
  // shown this operator's cached copy of it (review Q1).
  forgetCachedData();
});

// ── Selectors ───────────────────────────────────────────────────────────────
// Subscribing to one field rather than the whole store keeps a component from
// re-rendering when an unrelated part of the session changes.

export const useAdmin = () => useAuthStore((s) => s.admin);
export const useAuthStatus = () => useAuthStore((s) => s.status);
export const useIsAuthenticated = () => useAuthStore((s) => s.status === "authenticated");
export const useRole = () => useAuthStore((s) => s.admin?.role ?? null);
