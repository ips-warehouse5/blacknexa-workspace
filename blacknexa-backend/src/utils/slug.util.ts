/**
 * Slug helpers. Ported verbatim from the Worker so a given headline produces the
 * same slug it does today — slugs are the public article identifier used by
 * `/api/v1/news/article/:slug`, `/api/v1/news/translate/:slug` and `/news/:slug`.
 */

/** Stable, URL-safe slug from a headline, capped at 80 characters. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/** Parse an integer query parameter, returning `undefined` when absent/invalid. */
export function intParam(raw: unknown, fallback?: number): number | undefined {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse a float query parameter, returning `undefined` when absent/invalid. */
export function floatParam(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a boolean query parameter accepting `true` / `1`. */
export function boolParam(raw: unknown): boolean {
  const s = String(raw ?? "").toLowerCase();
  return s === "true" || s === "1";
}
