/**
 * Platform news facade — the locale-aware feed at `/api/v1/platform/news/*`.
 *
 * Ported from `platform-store.ts` plus `platform/fact-verify.ts`. This layer sits
 * above the news engine and exposes the *platform* category taxonomy (editorial
 * pillars such as "Black Business & Entrepreneurship") which each fan out to
 * several internal news categories.
 *
 * In the Worker this made a Durable-Object-to-Durable-Object HTTP call to reach
 * the article table. Here it is a direct service call — one less hop, same result.
 */

import newsService from "@/services/news.service";
import platformCacheService, { CACHE_TTL } from "@/services/platform_cache.service";
import { DEFAULTS } from "@/config/constants";
import {
  PLATFORM_CATEGORY_LABELS,
  PLATFORM_CATEGORY_MAP,
  type PlatformCategory,
} from "@/types/platform.interface";
import type { NewsArticle, NewsCategory } from "@/types/news.interface";

/** Every platform category id. */
export const ALL_PLATFORM_CATEGORIES: PlatformCategory[] = Object.keys(
  PLATFORM_CATEGORY_MAP,
) as PlatformCategory[];

export interface PlatformFeedResponse {
  locale: string;
  category: string;
  categoryLabel: string;
  total: number;
  data: NewsArticle[];
}

class PlatformNewsService {
  /** The internal news categories a platform category covers. */
  toNewsCategories(platform: PlatformCategory): NewsCategory[] {
    return (PLATFORM_CATEGORY_MAP[platform] ?? []) as NewsCategory[];
  }

  /** Display label for a platform category. */
  categoryLabel(platform: PlatformCategory): string {
    return PLATFORM_CATEGORY_LABELS[platform];
  }

  /** The full category catalogue with labels and their internal mappings. */
  listCategories(): Array<{
    id: PlatformCategory;
    label: string;
    newsCategories: NewsCategory[];
  }> {
    return ALL_PLATFORM_CATEGORIES.map((c) => ({
      id: c,
      label: this.categoryLabel(c),
      newsCategories: this.toNewsCategories(c),
    }));
  }

  /**
   * The platform feed, cached for a minute.
   *
   * A platform category maps to several news categories, so the articles are
   * fetched once and filtered in memory — the same approach the Worker took,
   * since the underlying feed endpoint accepts only a single category.
   */
  async getFeed(params: {
    category?: PlatformCategory;
    locale?: string;
    limit?: number;
    origin: string;
  }): Promise<PlatformFeedResponse> {
    const locale = params.locale ?? "en";
    const limit = params.limit ?? DEFAULTS.PLATFORM_FEED_LIMIT;
    const cacheKey = platformCacheService.feedKey({
      category: params.category ?? "all",
      locale,
      limit,
    });

    const cached = await platformCacheService.get<PlatformFeedResponse>(cacheKey);
    if (cached) return cached;

    const articles = await this.fetchArticles(params.category, limit, params.origin);

    const response: PlatformFeedResponse = {
      locale,
      category: params.category ?? "all",
      categoryLabel: params.category ? this.categoryLabel(params.category) : "All Categories",
      total: articles.length,
      data: articles,
    };

    await platformCacheService.set(cacheKey, response, CACHE_TTL.FEED);
    return response;
  }

  private async fetchArticles(
    platformCategory: PlatformCategory | undefined,
    limit: number,
    origin: string,
  ): Promise<NewsArticle[]> {
    if (!platformCategory) {
      return newsService.getFeed({ limit }, origin);
    }
    const newsCategories = this.toNewsCategories(platformCategory);
    const all = await newsService.getFeed({ limit }, origin);
    return all.filter((a) => newsCategories.includes(a.category));
  }
}

export const platformNewsService = new PlatformNewsService();
export default platformNewsService;
