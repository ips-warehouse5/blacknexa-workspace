/**
 * The HTTP client every API call goes through.
 *
 * Two things happen here that would otherwise be repeated in every hook:
 *
 * 1. A failed request is normalised into an `ApiError`, so callers handle one
 *    error shape instead of Axios's union of "response", "request" and
 *    "something else".
 *
 * 2. A 401 triggers exactly one refresh attempt, and the requests that raced
 *    into the same 401 wait for that one attempt rather than each starting
 *    their own. Without the sharing, a screen that loads five panels at once
 *    would fire five refreshes, and because refreshing rotates the token
 *    server-side, four of them would fail and sign the operator out.
 */

import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import env from "@/config/env";
import { ApiError, type ApiEnvelope, type Pagination } from "@/types/api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from "@/lib/token-storage";

/** Marks a request that has already been retried, so it cannot loop. */
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  /** Set on the refresh call itself, which must never trigger a refresh. */
  _skipAuthRefresh?: boolean;
}

export const http: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// ── Request: attach the bearer token ────────────────────────────────────────

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    // AxiosHeaders rather than a plain object: config.headers is an
    // AxiosHeaders instance by this point, and spreading it loses its methods.
    const headers = AxiosHeaders.from(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

// ── Session expiry ──────────────────────────────────────────────────────────

/**
 * Called when the session cannot be recovered.
 *
 * Wired to the auth store by `installSessionExpiryHandler` rather than imported,
 * because the store imports this module — going the other way would make a
 * cycle out of what is really just a notification.
 */
let onSessionExpired: (() => void) | null = null;

export function installSessionExpiryHandler(handler: () => void): void {
  onSessionExpired = handler;
}

function expireSession(): void {
  clearTokens();
  onSessionExpired?.();
}

// ── Refresh, shared across concurrent failures ──────────────────────────────

/** The in-flight refresh, if one is running. Cleared when it settles. */
let refreshInFlight: Promise<string> | null = null;

async function requestNewAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError("No refresh token available.", 401);

  // A bare axios call, not the shared instance: this must not carry the expired
  // bearer token, and must not itself be intercepted into another refresh.
  const { data } = await axios.post<ApiEnvelope<{ tokens: { accessToken: string } }>>(
    `${env.apiBaseUrl}/admin/auth/refresh`,
    { refreshToken },
    { headers: { "Content-Type": "application/json" }, timeout: 15_000 },
  );

  const next = data.result?.tokens?.accessToken;
  if (!next) throw new ApiError("Refresh response did not contain a token.", 401);

  setAccessToken(next);
  return next;
}

/**
 * Refresh the access token, joining an attempt already underway.
 *
 * The promise is stored before it is awaited, so a caller arriving mid-flight
 * gets the same promise rather than starting a second rotation.
 */
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= requestNewAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// ── Response: normalise errors, retry once after a refresh ──────────────────

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const config = error.config as RetriableConfig | undefined;

    // No response at all: offline, timeout, DNS, or a CORS rejection.
    if (!error.response) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return Promise.reject(
        new ApiError(
          offline
            ? "You appear to be offline. Check your connection and try again."
            : "Could not reach the server. Please try again.",
          0,
        ),
      );
    }

    const { status, data } = error.response;

    /*
     * A 401 from a sign-in endpoint means the credentials were wrong, not that
     * a session ended — there was no session. Treating the two the same is what
     * made a mistyped password answer "Your session has ended. Please sign in
     * again.", which is both untrue and unhelpful. These requests are also left
     * out of the refresh-and-retry path: they carry no access token, so there is
     * nothing to refresh, and attempting it would spend the refresh token and
     * sign the operator out for getting their password wrong.
     */
    const establishingSession = isSessionEstablishingRequest(config);

    if (
      status === 401 &&
      config &&
      !config._retried &&
      !config._skipAuthRefresh &&
      !establishingSession
    ) {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        const headers = AxiosHeaders.from(config.headers);
        headers.set("Authorization", `Bearer ${token}`);
        config.headers = headers;
        return await http.request(config);
      } catch {
        // The refresh token is spent too — this session is genuinely over.
        expireSession();
        return Promise.reject(
          new ApiError("Your session has ended. Please sign in again.", 401),
        );
      }
    }

    if (status === 401 && !establishingSession) expireSession();

    return Promise.reject(
      new ApiError(
        // The backend uses `error` on its legacy envelope and `message` on the
        // unified one; read both before falling back to something generic.
        data?.error || data?.message || defaultMessageFor(status),
        status,
        retryAfterFrom(error.response.headers),
      ),
    );
  },
);

/**
 * Seconds from a `Retry-After` header.
 *
 * The header is defined as either a delay in seconds or an HTTP date; both
 * spellings are handled because rate limiters differ on which they send.
 */
function retryAfterFrom(headers: unknown): number | undefined {
  const raw = (headers as Record<string, unknown> | undefined)?.["retry-after"];
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds)) return Math.max(0, Math.round(asSeconds));

  const asDate = Date.parse(String(raw));
  if (Number.isNaN(asDate)) return undefined;
  return Math.max(0, Math.round((asDate - Date.now()) / 1000));
}

/**
 * Whether a request is trying to *create* a session rather than use one.
 *
 * `/refresh` is deliberately absent: a 401 there does mean the session is over,
 * and should be handled as an expiry.
 */
const SESSION_ESTABLISHING_PATHS = [
  "/admin/auth/login",
  "/admin/auth/mfa/verify",
  "/admin/auth/mfa/resend",
  "/admin/auth/password/forgot",
  "/admin/auth/password/reset",
];

function isSessionEstablishingRequest(config: RetriableConfig | undefined): boolean {
  const url = config?.url ?? "";
  return SESSION_ESTABLISHING_PATHS.some((path) => url.includes(path));
}

function defaultMessageFor(status: number): string {
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That record could not be found.";
  if (status === 409) return "That change conflicts with the current state.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return "The request could not be completed.";
}

// ── Typed helpers ───────────────────────────────────────────────────────────

/**
 * Unwrap the response envelope.
 *
 * A 2xx carrying `success: 0` is still a failure — the server answered, but the
 * operation did not happen — so it is raised rather than returned.
 */
function unwrap<T>(envelope: ApiEnvelope<T>, status: number): T {
  if (envelope.success !== 1) {
    throw new ApiError(envelope.error || envelope.message || "The request failed.", status);
  }
  return envelope.result;
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<ApiEnvelope<T>>(url, config);
  return unwrap(res.data, res.status);
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.post<ApiEnvelope<T>>(url, body, config);
  return unwrap(res.data, res.status);
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.patch<ApiEnvelope<T>>(url, body, config);
  return unwrap(res.data, res.status);
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.delete<ApiEnvelope<T>>(url, config);
  return unwrap(res.data, res.status);
}

/**
 * Like `apiGet`, but returns the pagination block alongside the rows.
 * Used by the list screens, which need `total` for their footer.
 */
export async function apiGetPage<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ items: T[]; pagination: Pagination | undefined }> {
  const res = await http.get<ApiEnvelope<T[]>>(url, config);
  const items = unwrap(res.data, res.status);
  return { items, pagination: res.data.pagination };
}

export default http;
