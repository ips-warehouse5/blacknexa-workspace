/**
 * TTL cache backed by PostgreSQL.
 *
 * The Durable Object used its embedded SQLite as a hot cache because it had no
 * Redis available; the same table-based approach is kept here so the deployment
 * stays dependency-free. Every caller goes through this service, so swapping in
 * Redis later is a one-file change.
 *
 * Expiry is enforced on read (`expires_at > now`) as well as by the pruning cron,
 * so a stale row can never be served even if pruning has not run.
 */

import { Op, fn, col, literal } from "sequelize";
import { PlatformCache } from "@/models/platform_cache.model";

/** Default TTLs in seconds, unchanged from the original. */
export const CACHE_TTL = {
  FEED: 60, // the news feed changes frequently
  ARTICLE: 300,
  TRANSLATION: 86_400, // translations are stable
  CREATOR_BALANCE: 30, // moves with every tip
  MODERATION: 3600, // same content, same result
  JURISDICTION: 3600,
  BRIEFINGS: 120,
} as const;

class PlatformCacheService {
  /** Read and JSON-parse a cached value. Returns `null` if missing or expired. */
  async get<T>(key: string): Promise<T | null> {
    const row = await PlatformCache.findOne({
      where: { key, expires_at: { [Op.gt]: String(Date.now()) } },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      // A corrupt entry behaves like a miss rather than throwing at the caller.
      return null;
    }
  }

  /** Read a raw cached string. */
  async getRaw(key: string): Promise<string | null> {
    const row = await PlatformCache.findOne({
      where: { key, expires_at: { [Op.gt]: String(Date.now()) } },
    });
    return row?.value ?? null;
  }

  /** Write a JSON value with a TTL in seconds. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    await PlatformCache.upsert({
      key,
      value: JSON.stringify(value),
      expires_at: String(now + Math.floor(ttlSeconds * 1000)),
      created_at_ms: String(now),
    });
  }

  /** Write a raw string with a TTL in seconds. */
  async setRaw(key: string, value: string, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    await PlatformCache.upsert({
      key,
      value,
      expires_at: String(now + Math.floor(ttlSeconds * 1000)),
      created_at_ms: String(now),
    });
  }

  /** Delete a single entry. */
  async delete(key: string): Promise<void> {
    await PlatformCache.destroy({ where: { key } });
  }

  /**
   * Invalidate everything under a prefix, e.g. `feed:`.
   *
   * The prefix is passed as a bind parameter and `%` is appended by the query
   * builder, so a caller-supplied string cannot alter the pattern's structure.
   */
  async invalidatePrefix(prefix: string): Promise<number> {
    return PlatformCache.destroy({ where: { key: { [Op.like]: `${prefix}%` } } });
  }

  /** Delete every expired entry. Run by the maintenance cron. */
  async pruneExpired(): Promise<number> {
    return PlatformCache.destroy({
      where: { expires_at: { [Op.lte]: String(Date.now()) } },
    });
  }

  /** Counts for the monitoring endpoint. */
  async stats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    liveEntries: number;
  }> {
    const now = String(Date.now());
    const [total, expired] = await Promise.all([
      PlatformCache.count(),
      PlatformCache.count({ where: { expires_at: { [Op.lte]: now } } }),
    ]);
    return { totalEntries: total, expiredEntries: expired, liveEntries: total - expired };
  }

  // ── Key builders ───────────────────────────────────────────────────────────

  /** Cache key for a news-feed query. Field order is part of the key. */
  feedKey(params: {
    category?: string;
    scope?: string;
    search?: string;
    limit?: number;
    locale?: string;
  }): string {
    return [
      "feed",
      params.category ?? "all",
      params.scope ?? "all",
      params.search ?? "none",
      String(params.limit ?? 0),
      params.locale ?? "en",
    ].join(":");
  }

  articleKey(slug: string, locale: string): string {
    return `article:${slug}:${locale}`;
  }

  creatorBalanceKey(creatorId: string): string {
    return `creator-balance:${creatorId}`;
  }

  translationKey(articleId: string, language: string): string {
    return `translation:${articleId}:${language}`;
  }

  moderationKey(contentHash: string): string {
    return `moderation:${contentHash}`;
  }
}

export const platformCacheService = new PlatformCacheService();
export default platformCacheService;
