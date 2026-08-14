/**
 * Outbound HTTP helpers for the AI gateway and other third-party calls.
 *
 * Ported from the Worker's `fetchWithRetry`: a short timeout plus a single retry
 * absorbs the transient 5xx/520 responses that occasionally occur between the
 * edge and the gateway's origin, so a briefing request fails fast instead of
 * hanging. Node 20+ ships global `fetch` and `AbortController`, so the logic
 * carries over unchanged.
 */

import logger from "@/utils/logger.util";

export const AI_TIMEOUT_MS = 20_000;
export const AI_RETRY_DELAY_MS = 300;

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with an abort timeout and one retry on a non-OK status or a thrown
 * error. Returns `null` rather than throwing so callers can degrade gracefully —
 * every AI path in this codebase treats `null` as "skip / fall back".
 */
export async function fetchWithRetry<T>(
  url: string,
  init: RequestInit,
  parser: (res: Response) => Promise<T>,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<T | null> {
  const attempt = async (): Promise<T | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text().catch(() => "<no body>");
        logger.warn("[fetchWithRetry] non-ok response", {
          status: res.status,
          url,
          bodyPreview: body.slice(0, 200),
        });
        return null;
      }
      return await parser(res);
    } catch (err) {
      clearTimeout(timer);
      logger.warn("[fetchWithRetry] request threw", {
        url,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  let result = await attempt();
  if (result === null) {
    await sleep(AI_RETRY_DELAY_MS);
    result = await attempt();
  }
  return result;
}

/**
 * Single fetch with an abort timeout and no retry. Used where a retry would be
 * wasteful (image generation, TTS) or where the caller handles fallback itself.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    logger.warn("[fetchWithTimeout] request threw", {
      url,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Extract the first JSON object from a model response that may include prose,
 * code fences, or surrounding whitespace. The gateway does not support
 * `response_format: { type: "json_object" }` for every model, so JSON is
 * requested in the prompt and parsed defensively.
 */
export function extractJsonObject<T>(text: string, isValid: (parsed: T) => boolean): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as T;
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Extract a clean hostname (e.g. "reuters.com") from a URL string. */
export function safeHostname(urlString: string): string {
  try {
    return new URL(urlString).hostname.replace(/^www\./, "");
  } catch {
    return urlString;
  }
}
