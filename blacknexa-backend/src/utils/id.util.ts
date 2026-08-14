/**
 * Identifier generation.
 *
 * The Worker minted ids as `<prefix>_<epochMillis>_<base36 random>` (and
 * `bn-gen-<epochMillis>-<base36>` for generated articles). Those ids are part of
 * the public contract — they appear in responses and are sent back by the clients
 * in subsequent request paths — so the exact formats are preserved here rather
 * than replaced with bare UUIDs.
 *
 * `uuid()` is used for genuinely internal records (admin users) where the spec's
 * UUID-primary-key rule applies without breaking a client.
 */

import { v4 as uuidv4 } from "uuid";

/** Random base-36 suffix, matching `Math.random().toString(36).slice(2, 7)`. */
function randomSuffix(length = 5): string {
  let out = "";
  while (out.length < length) {
    out += Math.random().toString(36).slice(2);
  }
  return out.slice(0, length);
}

/** `<prefix>_<millis>_<rand5>` — tips, payouts, incidents, jobs, ledger, etc. */
export function prefixedId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomSuffix(5)}`;
}

/** `bn-gen-<millis>-<rand5>` — AI-generated articles. */
export function generatedArticleId(): string {
  return `bn-gen-${Date.now()}-${randomSuffix(5)}`;
}

/** RFC 4122 v4 UUID. */
export function uuid(): string {
  return uuidv4();
}

export { uuidv4 };
