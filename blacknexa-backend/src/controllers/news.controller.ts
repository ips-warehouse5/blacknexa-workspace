/**
 * News controller.
 *
 * Every response here is byte-compatible with the Cloudflare Worker it replaces,
 * because `NewsProvider.tsx` and `LocationProvider.tsx` read specific keys
 * (`success`, `data`, `article`, `translation`, `total`, `nearby`) and throw when
 * they are absent. The response shapes are therefore fixed contracts, not
 * choices — see `docs/MIGRATION_PLAN.md` §7 for why the unified
 * `responseData()` standard is not applied to these routes.
 *
 * Controllers hold no business logic: they read validated input, delegate to a
 * service, and emit. Errors propagate to the central handler via `asyncHandler`.
 */

import type { Request, Response } from "express";
import newsService from "@/services/news.service";
import aiGatewayService from "@/services/ai_gateway.service";
import translationService from "@/services/translation.service";
import seoService from "@/services/seo.service";
import { legacyJson, legacyError, legacyMessage } from "@/utils/response.util";
import { runBackground } from "@/utils/logger.util";
import { resolveOrigin } from "@/utils/origin.util";
import { validatedBody, validatedParams, validatedQuery } from "@/middlewares/validate.middleware";
import { DEFAULTS } from "@/config/constants";
import { isSupportedLanguage } from "@/services/i18n.service";
import type { LanguageCode } from "@/types/i18n.interface";
import type {
  GenerateArticleDto,
  LocalNewsRequest,
  NewsCategory,
  NewsFeedFilter,
  NewsScope,
} from "@/types/news.interface";

class NewsController {
  /** `GET /api/v1/news/feed` → `{ success, total, data }` */
  async feed(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<NewsFeedFilter>(req);
    const data = await newsService.getFeed(query, resolveOrigin(req));
    legacyJson(res, { total: data.length, data });
  }

  /**
   * `GET /api/v1/news/local` → `{ success, total, nearby, expandedNearby, location, data }`
   *
   * `data` entries carry an extra `nearby` boolean so the client can label
   * neighbouring-city stories.
   */
  async localFeed(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<LocalNewsRequest>(req);
    const result = await newsService.getLocalFeed(query, resolveOrigin(req));
    legacyJson(res, result);
  }

  /** `GET /api/v1/news/briefings` → `{ success, briefingTitle, data }` */
  async briefings(req: Request, res: Response): Promise<void> {
    const { limit } = validatedQuery<{ limit?: number }>(req);
    const result = await newsService.getBriefings(
      resolveOrigin(req),
      limit ?? DEFAULTS.BRIEFINGS_LIMIT,
    );
    legacyJson(res, result);
  }

  /**
   * `GET /api/v1/news/article/:slug` → `{ success, data }`
   *
   * The 404 uses `message` rather than `error`, matching the original.
   */
  async article(req: Request, res: Response): Promise<void> {
    const { slug } = validatedParams<{ slug: string }>(req);
    const data = await newsService.getArticleBySlug(
      decodeURIComponent(slug),
      resolveOrigin(req),
    );
    if (!data) {
      legacyMessage(res, "Article not found.", 404);
      return;
    }
    legacyJson(res, { data });
  }

  /**
   * `POST /api/v1/news/generate` → `{ success, article, translation? }`
   *
   * Status codes are preserved exactly: 500 when the gateway is unconfigured, 400
   * for a missing prompt, 502 when no source material was found, 200 with
   * `cached: true` for an already-published story, and 201 for a fresh publish.
   */
  async generate(req: Request, res: Response): Promise<void> {
    // Gate on the service, not on `env.ai.enabled` directly: the AI path may be
    // served by the Python engine, in which case the toolkit secret lives there
    // and not here. Checking the env var alone rejected every request in that
    // (normal) deployment shape.
    if (!aiGatewayService.isEnabled) {
      legacyError(res, "AI gateway not configured on the server.", 500);
      return;
    }

    const body = validatedBody<GenerateArticleDto>(req);
    const origin = resolveOrigin(req);

    // An unsupported code falls back to English rather than failing the request,
    // matching the Worker's `isSupportedLanguage(...) ? lang : "en"`.
    const targetLanguage: LanguageCode = isSupportedLanguage(body.language)
      ? body.language
      : "en";

    const result = await newsService.generateArticle({
      topicPrompt: body.topicPrompt,
      category: (body.category ?? "business-wealth-stewardship") as NewsCategory,
      scope: (body.scope ?? "national") as NewsScope,
      origin,
    });

    if (result.outcome === "no-sources") {
      legacyError(
        res,
        "No current source material was found for that topic. Try a more specific prompt.",
        502,
      );
      return;
    }

    if (result.outcome === "duplicate") {
      // Serve the cached native-language view so the duplicate path is as
      // localized as a fresh generation.
      const cachedTranslation =
        targetLanguage !== "en"
          ? await translationService.readTranslation(result.article.id, targetLanguage)
          : null;

      legacyJson(res, {
        article: result.article,
        translation: cachedTranslation ?? undefined,
        message: "This briefing is already live — returning the existing article.",
        cached: true,
      });
      return;
    }

    // Fresh publish. When the reader is not reading in English, translate before
    // responding so the story arrives natively in one round trip; the remaining
    // 17 languages are pre-translated in the background.
    let translation = null;
    if (targetLanguage !== "en") {
      translation = await translationService.translateAndCache(
        result.article.id,
        targetLanguage,
        {
          headline: result.article.headline,
          summary: result.article.summary,
          content: result.article.content,
          godlyPrincipleAlignment: result.article.godlyPrincipleAlignment,
        },
      );
    }

    legacyJson(
      res,
      { article: result.article, translation: translation ?? undefined },
      201,
    );

    // Instant indexing for the new URL, after the response is on the wire.
    runBackground(seoService.pingIndexNow([result.article.slug]), "indexnow ping");
    runBackground(seoService.pingSitemapEngines(), "sitemap ping");
  }

  /**
   * `GET /api/v1/news/translate/:slug` → `{ success, data, cached?, background? }`
   *
   * Non-blocking by design: `en` returns the source, a cache hit returns instantly,
   * and a cache miss returns the English source with `background: true` while the
   * translation is generated. The reader is never blocked, and a failure in the
   * translation pipeline still returns readable English with status 200 — which is
   * what the app's error handling expects.
   */
  async translate(req: Request, res: Response): Promise<void> {
    const { slug } = validatedParams<{ slug: string }>(req);
    const { lang } = validatedQuery<{ lang: LanguageCode }>(req);

    const row = await newsService.findRowBySlug(decodeURIComponent(slug));
    if (!row) {
      legacyMessage(res, "Article not found.", 404);
      return;
    }

    const englishView = translationService.buildEnglishView(row);

    try {
      // English short-circuits — no model call.
      if (lang === "en") {
        legacyJson(res, { data: englishView });
        return;
      }

      const cached = await translationService.readTranslation(row.id, lang);
      if (cached) {
        legacyJson(res, { data: cached, cached: true });
        return;
      }

      // Miss: serve English now, warm the cache for next time.
      legacyJson(res, { data: englishView, cached: false, background: true });
      runBackground(
        translationService.pretranslateAll(row.id),
        "translation cache warm",
      );
    } catch (err) {
      // Graceful fallback: never block a reader on a translation failure.
      legacyJson(res, {
        data: englishView,
        cached: false,
        background: false,
        error: err instanceof Error ? err.message : "translation failed",
      });
    }
  }

  // ── Operational routes (admin-guarded) ─────────────────────────────────────

  /** `POST /api/v1/news/refresh-daily` → `{ success, dayIndex, attempted, ... }` */
  async refreshDaily(req: Request, res: Response): Promise<void> {
    const { force } = validatedQuery<{ force: boolean }>(req);
    const result = await newsService.runDailyBatch(force, resolveOrigin(req));
    legacyJson(res, result);

    if (result.slugs.length > 0) {
      runBackground(seoService.pingIndexNow(result.slugs), "indexnow ping");
      runBackground(seoService.pingSitemapEngines(), "sitemap ping");
    }
  }

  /** `POST /api/v1/news/prune-duplicates` → `{ success, scanned, removed, ... }` */
  async pruneDuplicates(_req: Request, res: Response): Promise<void> {
    const result = await newsService.pruneDuplicates();
    legacyJson(res, result);
  }

  /** `POST /api/v1/news/backfill-images` → `{ success, attempted, upgraded, ... }` */
  async backfillImages(req: Request, res: Response): Promise<void> {
    const { limit } = validatedQuery<{ limit: number }>(req);
    const result = await newsService.backfillImages(limit);
    legacyJson(res, result);
  }

  /**
   * `POST /api/v1/news/backfill-translations` → `{ success, status, attempted, message }`
   *
   * Returns immediately and runs the work in the background, as the original did —
   * translating 10 articles into 18 languages is far longer than a request should
   * hold open.
   */
  async backfillTranslations(req: Request, res: Response): Promise<void> {
    const { limit } = validatedQuery<{ limit: number }>(req);
    const ids = await newsService.recentArticleIds(limit);

    legacyJson(res, {
      status: "processing",
      attempted: ids.length,
      message: "Translations are being generated in the background.",
    });

    runBackground(newsService.backfillTranslations(ids), "translation backfill");
  }
}

export const newsController = new NewsController();
export default newsController;
