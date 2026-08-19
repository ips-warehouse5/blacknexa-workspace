/**
 * Development-only network logger.
 *
 * React Native's debugger does not reliably surface `fetch` traffic in its
 * Network tab, which leaves API calls invisible while debugging. This module
 * wraps the global `fetch` so every request and response is printed to the
 * console with its method, URL, status and duration.
 *
 * It wraps the *global* fetch rather than instrumenting `apiClient` because
 * several call sites still call `fetch` directly (tipping, safety beacon, live
 * chat, weather, OAuth initiate). Wrapping the global catches those too, so the
 * log is a complete picture of the app's network activity.
 *
 * Nothing here runs in production: `installNetworkLogger` returns immediately
 * unless `__DEV__` is true.
 *
 * Security: Authorization headers, bearer tokens and any header or body field
 * whose name suggests a credential are redacted before printing. Bodies are
 * truncated. See `.ai/operating-rules.md` — never log secrets.
 */

const BODY_PREVIEW_LIMIT = 500;

/** Header names that must never be printed in full. */
const SENSITIVE_HEADER = /authorization|cookie|secret|api[-_]?key|token/i;

/** Body/JSON keys that must never be printed in full. */
const SENSITIVE_FIELD =
  /secret|token|password|code_verifier|code_challenge|authorization|api[-_]?key/i;

/**
 * Guards against double-wrapping. Fast refresh re-evaluates modules, and
 * wrapping an already-wrapped fetch would duplicate every log line and stack
 * timing measurements.
 */
const INSTALLED_FLAG = "__blacknexaNetworkLoggerInstalled";

function redactValue(value: unknown): string {
  const str = typeof value === "string" ? value : String(value);
  if (str.length <= 8) return "<redacted>";
  return `<redacted:${str.length} chars>`;
}

function formatHeaders(init?: RequestInit): string {
  if (!init?.headers) return "";
  const entries: [string, string][] = [];
  try {
    new Headers(init.headers).forEach((value, key) => {
      entries.push([key, SENSITIVE_HEADER.test(key) ? redactValue(value) : value]);
    });
  } catch {
    return "";
  }
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

/**
 * Produce a short, credential-free preview of a request or response body.
 * JSON is re-serialised with sensitive fields masked; anything else is
 * truncated as plain text.
 */
function previewBody(body: unknown): string {
  if (body == null) return "";
  if (typeof body !== "string") {
    // FormData, Blob, ArrayBuffer and friends: describe rather than dump.
    return `<${(body as object)?.constructor?.name ?? "non-string body"}>`;
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const masked: Record<string, unknown> = Array.isArray(parsed)
        ? { items: `<array:${parsed.length}>` }
        : {};
      if (!Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          masked[key] = SENSITIVE_FIELD.test(key) ? redactValue(value) : value;
        }
      }
      const out = JSON.stringify(masked);
      return out.length > BODY_PREVIEW_LIMIT
        ? `${out.slice(0, BODY_PREVIEW_LIMIT)}… (${out.length} chars)`
        : out;
    }
  } catch {
    /* not JSON — fall through to the plain-text path */
  }

  return body.length > BODY_PREVIEW_LIMIT
    ? `${body.slice(0, BODY_PREVIEW_LIMIT)}… (${body.length} chars)`
    : body;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request)?.url ?? String(input);
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL)) {
    return ((input as Request)?.method ?? "GET").toUpperCase();
  }
  return "GET";
}

/**
 * Wrap the global `fetch` so all network traffic is logged. Safe to call more
 * than once — subsequent calls are no-ops. Call once, as early as possible.
 */
export function installNetworkLogger(): void {
  if (!__DEV__) return;

  const globalScope = globalThis as typeof globalThis & {
    [INSTALLED_FLAG]?: boolean;
  };
  if (globalScope[INSTALLED_FLAG]) return;
  globalScope[INSTALLED_FLAG] = true;

  const originalFetch = globalThis.fetch;
  let requestId = 0;

  globalThis.fetch = async function loggedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const id = ++requestId;
    const method = resolveMethod(input, init);
    const url = resolveUrl(input);
    const startedAt = Date.now();

    const headers = formatHeaders(init);
    const body = previewBody(init?.body);
    console.log(
      `[API] →#${id} ${method} ${url}` +
        (headers ? `\n[API]    headers: ${headers}` : "") +
        (body ? `\n[API]    body: ${body}` : "")
    );

    try {
      const response = await originalFetch(input, init);
      const duration = Date.now() - startedAt;

      // Read the body from a clone so the caller still receives an unconsumed
      // response. If cloning or reading fails, log without the preview rather
      // than interfering with the request.
      let responsePreview = "";
      try {
        const text = await response.clone().text();
        responsePreview = previewBody(text);
      } catch {
        responsePreview = "<unreadable body>";
      }

      const marker = response.ok ? "←" : "←✗";
      console.log(
        `[API] ${marker}#${id} ${response.status} ${method} ${url} (${duration}ms)` +
          (responsePreview ? `\n[API]    response: ${responsePreview}` : "")
      );

      return response;
    } catch (err) {
      const duration = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[API] ←✗#${id} FAILED ${method} ${url} (${duration}ms): ${message}`);
      // Never swallow the error — rethrow so callers behave exactly as before.
      throw err;
    }
  };

  console.log("[API] Network logger installed (dev only). All fetch traffic will be logged.");
}
