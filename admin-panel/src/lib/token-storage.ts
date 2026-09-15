/**
 * Where session tokens live in the browser.
 *
 * Tokens are held in Web Storage, which means any script running on this origin
 * can read them. That is a real and well-known weakness of the approach; the
 * alternative — httpOnly cookies — needs the API to set them and brings CSRF
 * defences of its own. This console ships the storage approach knowingly, and
 * mitigates what it can: the access token stays in memory during a session, only
 * the refresh token is persisted, and "remember me" decides whether that
 * outlives the tab.
 *
 * If the API later grows cookie-based sessions, this module is the only place
 * the console needs to change.
 */

const REFRESH_KEY = "bn_admin_refresh";
const REMEMBER_KEY = "bn_admin_remember";

/**
 * The access token is kept here, not in storage.
 *
 * It is short-lived and reissued from the refresh token on load, so persisting
 * it would widen the exposure window for no gain.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Whichever store the last sign-in chose, or null if there is no session. */
function activeStore(): Storage | null {
  try {
    if (localStorage.getItem(REFRESH_KEY)) return localStorage;
    if (sessionStorage.getItem(REFRESH_KEY)) return sessionStorage;
  } catch {
    // Storage can throw outright in a locked-down browser context.
  }
  return null;
}

export function getRefreshToken(): string | null {
  try {
    return activeStore()?.getItem(REFRESH_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist the refresh token.
 *
 * `remember` picks the store: localStorage survives the browser closing,
 * sessionStorage ends with the tab. Both stores are cleared first so a signed-in
 * session cannot leave a stale token behind in the other one.
 */
export function setRefreshToken(token: string, remember: boolean): void {
  try {
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(REFRESH_KEY, token);
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    // A session that cannot be persisted still works until the tab closes.
  }
}

/** Whether the last sign-in asked to be remembered. Drives the login checkbox. */
export function wasRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

/** Drop every trace of the session from this browser. */
export function clearTokens(): void {
  accessToken = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nothing to do — the in-memory access token is already gone.
  }
}
