/**
 * The HTTP client every call to the platform API goes through.
 *
 * One environment variable — `API_BASE_URL` — names the backend, and paths
 * live in code next to the feature that uses them. The alternative, a full URL
 * per endpoint in the environment, puts the API surface in deployment config:
 * adding an endpoint becomes a deploy-time change, the same host gets spelled
 * out repeatedly, and nothing stops two of them drifting onto different
 * environments.
 *
 * **Server-only.** There is no `NEXT_PUBLIC_` prefix, so the variable never
 * reaches the browser bundle and the base URL is not public. Call these from
 * route handlers and Server Components; the browser talks to this app's own
 * `/api/*` routes, which proxy through here.
 */

/** Thrown by every function in this module. Carries what the caller needs to answer with. */
export class ApiError extends Error {
  /** HTTP status from the API, or 0 when the request never got a response. */
  readonly status: number;

  /** True when the API is not configured — a deployment fault, not a caller one. */
  readonly isUnconfigured: boolean;

  constructor(message: string, status: number, isUnconfigured = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isUnconfigured = isUnconfigured;
  }

  /** The API understood the request and refused it — the caller can act on this. */
  get isClientFault(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** The request never reached the API: DNS, connection refused, timeout. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * The API's response envelopes.
 *
 * The backend emits two shapes and both are read here: `{ success: 1, result }`
 * on the endpoints written for this service, and `{ success: false, error }` on
 * the validation and rate-limit paths it inherited from the Worker it replaced.
 * Handling one and not the other is how a rate-limit message ends up rendered
 * as "undefined".
 */
interface ApiEnvelope<T> {
  success?: 1 | 0 | boolean;
  message?: string;
  result?: T;
  error?: string;
}

/** How long to wait before giving up. A form submit should not hang a page. */
const TIMEOUT_MS = 15_000;

/**
 * The configured API base, e.g. `https://api.blacknexa.org/api/v1`.
 *
 * Returns null rather than throwing so a caller can tell "not deployed yet"
 * from "the call failed", which are different things to tell a visitor.
 */
export function apiBaseUrl(): string | null {
  const raw = process.env.API_BASE_URL?.trim();
  if (!raw) return null;
  // Trimmed so `…/api/v1` and `…/api/v1/` both behave; paths always lead with "/".
  return raw.replace(/\/+$/, "");
}

/** Whether the API is configured. Lets a route answer honestly when it is not. */
export function isApiConfigured(): boolean {
  return apiBaseUrl() !== null;
}

export interface RequestOptions {
  /** Path under the base, leading slash included — e.g. `/contact`. */
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra headers. `Content-Type` is set for you when there is a body. */
  headers?: Record<string, string>;
}

/**
 * Send a request and unwrap the envelope.
 *
 * Every failure path — unconfigured, unreachable, non-2xx, a 2xx carrying
 * `success: 0` — raises `ApiError`, so a caller has one thing to catch instead
 * of a status check, a network check and an envelope check.
 */
export async function apiRequest<T>({
  path,
  method = "GET",
  body,
  headers = {},
}: RequestOptions): Promise<T> {
  const base = apiBaseUrl();
  if (!base) {
    throw new ApiError("The API is not configured for this environment.", 0, true);
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // These are live reads and writes behind this app's own routes; Next
      // caching them would serve a stale answer to a fresh submission.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // AbortError (timeout) and TypeError (DNS, refused, TLS) both land here.
    // Status 0 marks "no response at all", which is never the caller's fault.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ApiError(
      timedOut ? "The API did not respond in time." : "Could not reach the API.",
      0,
    );
  }

  // A non-JSON body is possible — a proxy's HTML error page, or an empty 204.
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new ApiError(
      envelope?.error || envelope?.message || `The API returned ${response.status}.`,
      response.status,
    );
  }

  /*
   * A 2xx carrying `success: 0` is still a failure: the API answered, but the
   * operation did not happen. Checked loosely because the two envelopes spell
   * success differently (`1` and `true`); only an explicit falsy value counts
   * as a refusal, so an endpoint that omits the field is not treated as failed.
   */
  if (envelope && (envelope.success === 0 || envelope.success === false)) {
    throw new ApiError(
      envelope.error || envelope.message || "The request failed.",
      response.status,
    );
  }

  return (envelope?.result ?? null) as T;
}

/** POST a JSON body. */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>({ path, method: "POST", body });
}

/** GET a JSON resource. */
export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>({ path, method: "GET" });
}
