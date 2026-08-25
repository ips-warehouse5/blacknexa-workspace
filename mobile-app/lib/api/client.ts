/**
 * The single HTTP client for the BlackNexa backend.
 *
 * Everything that talks to the API goes through `api.*` here, so three concerns
 * live in one place instead of being re-solved per screen:
 *
 *   1. **Token storage.** The access token is held in memory and mirrored to
 *      SecureStore; the refresh token lives in SecureStore only. Neither ever
 *      touches AsyncStorage, which is unencrypted.
 *
 *   2. **One refresh at a time.** A screen with three parallel queries produces
 *      three simultaneous 401s on expiry. Without a mutex, all three would
 *      refresh, and two of them would present a token the server has already
 *      rotated away — logging the user out at random. So the first 401 starts a
 *      refresh and the rest await that same promise.
 *
 *   3. **Envelope unwrapping.** The backend answers `{ success: 1, message,
 *      result }` on the new surface and `{ success: false, error }` on failure.
 *      Callers get `result` or a thrown `ApiError`; no screen parses envelopes.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_KEY = "bn.access_token";
const REFRESH_KEY = "bn.refresh_token";

/**
 * SecureStore is unavailable on web. Falling back to `localStorage` there keeps
 * the web preview usable while keeping native — the only shipping target — on
 * the encrypted store.
 */
const store = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* private mode — the session simply will not persist */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* nothing to clear */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/** Resolve the API origin. Set `EXPO_PUBLIC_API_URL` in the app's .env. */
function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, "");
  // A physical device cannot reach the host's localhost, so this default is only
  // ever right in a simulator — hence the warning rather than a silent fallback.
  if (__DEV__) {
    console.warn(
      "[api] EXPO_PUBLIC_API_URL is not set — falling back to http://localhost:4000, which a physical device cannot reach.",
    );
  }
  return "http://localhost:4000";
}

export const API_BASE_URL = resolveBaseUrl();
const API_PREFIX = "/api/v1";

/** A failed request, carrying the server's own message for display. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when the request failed before reaching the server. */
    readonly offline = false,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when re-authenticating is the fix. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header. Used by the endpoints that mint tokens. */
  anonymous?: boolean;
  /** Internal: prevents a refreshed request from retrying forever. */
  isRetry?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

type Listener = () => void;

const DEFAULT_TIMEOUT_MS = 20_000;

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private loaded = false;

  /** The in-flight refresh, shared by every caller that hits a 401. */
  private refreshInFlight: Promise<boolean> | null = null;

  /** Notified when the session ends for a reason the user did not choose. */
  private readonly signOutListeners = new Set<Listener>();

  // ── Token lifecycle ───────────────────────────────────────────────────────

  /** Read persisted tokens. Safe to call repeatedly; only the first does work. */
  async loadSession(): Promise<boolean> {
    if (this.loaded) return Boolean(this.accessToken || this.refreshToken);
    const [access, refresh] = await Promise.all([
      store.get(ACCESS_KEY),
      store.get(REFRESH_KEY),
    ]);
    this.accessToken = access;
    this.refreshToken = refresh;
    this.loaded = true;
    return Boolean(access || refresh);
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.loaded = true;
    await Promise.all([
      store.set(ACCESS_KEY, accessToken),
      store.set(REFRESH_KEY, refreshToken),
    ]);
  }

  async clearTokens(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.loaded = true;
    await Promise.all([store.remove(ACCESS_KEY), store.remove(REFRESH_KEY)]);
  }

  hasSession(): boolean {
    return Boolean(this.accessToken || this.refreshToken);
  }

  /** Subscribe to involuntary sign-out (revoked device, rotated token). */
  onSignOut(listener: Listener): () => void {
    this.signOutListeners.add(listener);
    return () => this.signOutListeners.delete(listener);
  }

  private emitSignOut(): void {
    for (const listener of this.signOutListeners) {
      try {
        listener();
      } catch {
        /* a listener must not break the sign-out path */
      }
    }
  }

  /**
   * Exchange the refresh token for a new pair.
   *
   * Callers never invoke this directly — `request` does, on a 401. Concurrent
   * callers share one promise; see point 2 in the file header.
   */
  private async refreshSession(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const token = this.refreshToken;
      if (!token) return false;
      try {
        const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: token }),
        });
        if (!response.ok) {
          // The server has rotated or revoked this token: the session is over,
          // and retrying with the same value would fail identically.
          await this.clearTokens();
          this.emitSignOut();
          return false;
        }
        const payload = (await response.json()) as {
          result?: { tokens?: { accessToken: string; refreshToken: string } };
        };
        const tokens = payload.result?.tokens;
        if (!tokens?.accessToken || !tokens?.refreshToken) {
          await this.clearTokens();
          this.emitSignOut();
          return false;
        }
        await this.setTokens(tokens.accessToken, tokens.refreshToken);
        return true;
      } catch {
        // A network failure is not proof the session ended — keep the tokens so
        // the next attempt can succeed once connectivity returns.
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = "GET",
      body,
      anonymous = false,
      isRetry = false,
      signal,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;

    if (!this.loaded && !anonymous) await this.loadSession();

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (!anonymous && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    // Every request gets a deadline. Without one, a dead connection leaves a
    // spinner on screen forever — which the design never shows a way out of.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new ApiError(
        aborted
          ? "That took too long. Check your connection and try again."
          : "You appear to be offline.",
        0,
        true,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    // 401 on an authenticated call: refresh once, then replay.
    if (response.status === 401 && !anonymous && !isRetry && this.refreshToken) {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        return this.request<T>(path, { ...options, isRetry: true });
      }
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // A non-JSON body from a proxy or gateway.
        throw new ApiError("Something went wrong. Please try again.", response.status);
      }
    }

    const envelope = (payload ?? {}) as {
      success?: boolean | number;
      message?: string;
      error?: string;
      result?: T;
    };

    if (!response.ok || envelope.success === false || envelope.success === 0) {
      // The backend puts the user-facing sentence in `error` on the legacy
      // envelope and in `message` on the unified one. Both are already written as
      // copy a person can read, so neither is rewritten here.
      const message =
        envelope.error ??
        envelope.message ??
        "Something went wrong. Please try again.";
      throw new ApiError(message, response.status);
    }

    return (envelope.result ?? (payload as T)) as T;
  }

  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  /**
   * A body is optional but allowed. `DELETE /users/me` needs one — the disposition
   * and the re-authentication proof — and putting either in a query string would
   * write a password into every access log between here and the server.
   */
  delete<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE", body });
  }
}

export const api = new ApiClient();
export default api;
