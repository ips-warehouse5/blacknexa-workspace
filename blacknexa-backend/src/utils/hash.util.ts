/**
 * Hashing helpers.
 *
 * `articleContentHash` and `djb2` are byte-for-byte ports of the Worker's
 * implementations. They must not be "improved": existing `content_hash` values
 * in the article table and existing persistence-snapshot checksums were produced
 * by these exact algorithms, and the dedup/compare paths depend on matching them.
 */

import crypto from "crypto";
import type { NewsCategory, NewsScope } from "@/types/news.interface";

/**
 * FNV-1a 32-bit over `headline|summary|category|scope`, base-36 encoded.
 *
 * Two articles with the same headline, summary, category and scope are the same
 * story even if the AI gave them different ids or slugs — this is what the feed
 * dedup and the 24-hour duplicate short-circuit key on.
 */
export function articleContentHash(
  headline: string,
  summary: string,
  category: NewsCategory,
  scope: NewsScope,
): string {
  const text = `${headline.trim()}|${summary.trim()}|${category}|${scope}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * FNV-1a 32-bit over an arbitrary string, returned as an unsigned integer.
 * Used to pick a deterministic curated fallback image per article.
 */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** djb2 string hash, 8-char hex. Used by the persistence-snapshot checksum. */
export function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** SHA-256 hex digest of the trimmed text. Used for moderation dedup. */
export function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

/**
 * Normalise a headline for deduplication: lowercase, strip punctuation, collapse
 * whitespace. Catches generated variants such as
 * "Global Car Usage Exceeds 1.6 Billion Vehicles" vs the same headline with a
 * ": 2025 Report" suffix.
 */
export function normalizedHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
