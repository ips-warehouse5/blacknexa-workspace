import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

// Only consulted in production — see the isDev checks below. In dev this
// stays empty so every request re-hashes, picking up file replacements
// without needing a server restart.
const cache = new Map<string, string>();

/**
 * Appends a content-hash query string to a `/public` asset path, e.g.
 * `/images/blacknexa/hero-community.jpg` -> `/images/blacknexa/hero-community.jpg?v=3f9a1c2b`.
 *
 * Root cause this fixes: replacing an image file in `/public` while keeping
 * the same filename does NOT change its URL, so the Next.js Image
 * Optimizer's on-disk cache (`.next/cache/images`, keyed by URL + width +
 * quality — not file content) and the browser's HTTP cache both keep
 * serving the old bytes under that same URL until their TTL happens to
 * expire. Changing the URL itself whenever the file's content changes
 * (rather than relying on any cache TTL) makes both caches treat an
 * updated image as a brand-new resource immediately — no manual purging,
 * no TTL tuning, and no need to disable caching.
 *
 * Server-only (uses `fs`) — call this from Server Components, not Client
 * Components.
 */
export function versionedAsset(publicPath: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev) {
    const cached = cache.get(publicPath);
    if (cached) return cached;
  }

  try {
    const filePath = path.join(process.cwd(), "public", publicPath);
    const bytes = readFileSync(filePath);
    const hash = createHash("md5").update(bytes).digest("hex").slice(0, 8);
    const versioned = `${publicPath}?v=${hash}`;
    if (!isDev) cache.set(publicPath, versioned);
    return versioned;
  } catch {
    // File missing or unreadable — fall back to the unversioned path rather
    // than breaking the page; the underlying 404 (if any) is unaffected.
    return publicPath;
  }
}
