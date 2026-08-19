import * as SecureStore from "expo-secure-store";

export const FUNCTIONS_URL =
  process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL?.replace(/\/$/, "") ??
  "https://blacknexa-backend.rork.app";

export const AUTH_URL =
  process.env.EXPO_PUBLIC_RORK_AUTH_URL?.replace(/\/$/, "") ??
  "https://auth.rork.com";

export const TOOLKIT_URL =
  process.env.EXPO_PUBLIC_TOOLKIT_URL?.replace(/\/$/, "") ??
  "https://toolkit.rork.com";

const SECURE_AUTH_KEY = "blacknexa.auth.tokens.v1";

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export type RequestConfig = RequestInit & {
  params?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  skipAuth?: boolean;
};

/**
 * Reads the stored access token from SecureStore if available.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_AUTH_KEY);
    if (!raw) return null;
    const tokens = JSON.parse(raw);
    return tokens.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds a URL with query parameters.
 */
export function buildUrl(
  pathOrUrl: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  baseUrl: string = FUNCTIONS_URL
): string {
  const isAbsolute = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://");
  const full = isAbsolute ? pathOrUrl : `${baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  if (!params) return full;

  const url = new URL(full);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });
  return url.toString();
}

/**
 * Central HTTP client with typed responses, automatic token injection,
 * configurable timeout, and structured error handling.
 */
export async function apiClient<T = any>(
  pathOrUrl: string,
  config: RequestConfig = {},
  baseUrl: string = FUNCTIONS_URL
): Promise<T> {
  const { params, timeoutMs = 15000, skipAuth = false, headers: customHeaders, ...init } = config;
  const url = buildUrl(pathOrUrl, params, baseUrl);

  const headers = new Headers(customHeaders);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    try {
      JSON.parse(init.body);
      headers.set("Content-Type", "application/json");
    } catch {
      // not JSON string
    }
  }

  if (!skipAuth && !headers.has("Authorization")) {
    const token = await getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMessage =
        (typeof data === "object" && data !== null && (data.error || data.message)) ||
        `HTTP Error ${res.status}: ${res.statusText}`;
      throw new ApiError(errorMessage, res.status, data);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new ApiError(`Request timeout after ${timeoutMs}ms`, 408);
    }
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err?.message || "Network request failed", 0);
  }
}

/** Legacy helper alias for backwards compatibility */
export const apiFetch = async <T = any>(
  endpoint: string,
  options?: RequestConfig
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> => {
  try {
    const data = await apiClient<T>(endpoint, options);
    return { ok: true, status: 200, data };
  } catch (e: any) {
    return {
      ok: false,
      status: e?.status || 0,
      data: null,
      error: e?.message || "Network error",
    };
  }
};
