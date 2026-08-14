/**
 * News service — the article table, the feed, and the generation pipeline.
 *
 * This is the port of the `NewsStore` Durable Object. The behaviour that matters
 * to the clients is preserved exactly:
 *
 *   • Reads are de-duplicated four ways (id, slug, normalised headline, content
 *     hash) because the AI occasionally produces the same story under a different
 *     slug, and the apps would otherwise render it twice.
 *   • Image and audio URLs are rewritten on read: stored bytes win, otherwise a
 *     deterministic curated photo, and legacy Unsplash/Picsum URLs are upgraded.
 *   • `POST /generate` uses the fast path and returns in ~2 seconds; the unique
 *     image, TTS audio and 18 translations are produced after the response.
 *   • A story already published in the last 24 hours short-circuits to the
 *     existing article with `cached: true` instead of creating a duplicate.
 */

import { Op, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger, { runBackground } from "@/utils/logger.util";
import {
  articleContentHash,
  normalizedHeadline,
} from "@/utils/hash.util";
import { base64ToBytes } from "@/utils/binary.util";
import Article from "@/models/article.model";
import { ArticleImage, ArticleAudio } from "@/models/article_media.model";
import ArticleTranslation from "@/models/article_translation.model";
import aiGatewayService from "@/services/ai_gateway.service";
import i18nService from "@/services/i18n.service";
import localNewsService from "@/services/local_news.service";
import translationService from "@/services/translation.service";
import { SEED_NEWS } from "@/data/seed_news.data";
import { DAILY_BATCH_SIZE, dayIndexAt, pickDailyBatch } from "@/data/daily_prompts.data";
import {
  AUDIO_PATH_PREFIX,
  BACKFILL_IMAGE_MAX_ATTEMPTS,
  BRIEFING_TITLE,
  CONCURRENCY,
  DAY_MS,
  DEFAULTS,
  DUPLICATE_WINDOW_HOURS,
  IMAGE_PATH_PREFIX,
  LEGACY_IMAGE_HOSTS,
  PLACEHOLDER_AUDIO_HOST,
} from "@/config/constants";
import type {
  BackfillImagesResult,
  BackfillTranslationsResult,
  BriefingItem,
  DailyBatchResult,
  LocalNewsRequest,
  NewsArticle,
  NewsCategory,
  NewsFeedFilter,
  NewsScope,
  PruneDuplicatesResult,
  RankedLocalArticle,
  VerifiedSource,
} from "@/types/news.interface";
import type { FastGeneratedArticle, GeneratedArticle } from "@/types/ai.interface";

class NewsService {
  /** Guards `ensureSeed` so concurrent first requests cannot double-seed. */
  private seedPromise: Promise<void> | null = null;

  // ── Seeding ────────────────────────────────────────────────────────────────

  /**
   * Insert the bundled seed articles on first use, so feeds render before any AI
   * run has happened. Mirrors the Durable Object's lazy `ensureSeed()`.
   */
  async ensureSeed(): Promise<void> {
    if (this.seedPromise) return this.seedPromise;
    this.seedPromise = (async () => {
      const count = await Article.count();
      if (count > 0) return;
      logger.info(`[news] seeding ${SEED_NEWS.length} articles`);
      for (const a of SEED_NEWS) {
        await this.upsertArticle(a);
      }
    })().catch((err: unknown) => {
      // Allow a later request to retry rather than caching the failure forever.
      this.seedPromise = null;
      throw err;
    });
    return this.seedPromise;
  }

  // ── Persistence primitives ─────────────────────────────────────────────────

  /** Insert or replace an article row, computing the content hash if absent. */
  async upsertArticle(a: NewsArticle, transaction?: Transaction): Promise<void> {
    const hash =
      a.contentHash || articleContentHash(a.headline, a.summary, a.category, a.scope);
    await Article.upsert(
      {
        id: a.id,
        slug: a.slug,
        headline: a.headline,
        category: a.category,
        scope: a.scope,
        summary: a.summary,
        content: a.content,
        image_url: a.imageUrl,
        fact_check_status: a.factCheckStatus,
        verified_sources: a.verifiedSources ?? [],
        godly_principle_alignment: a.godlyPrincipleAlignment,
        audio_url: a.audioUrl,
        published_at: a.publishedAt,
        author: a.author,
        content_hash: hash,
      },
      { transaction },
    );
  }

  /** Persist AI-generated image bytes for an article. */
  async saveImage(articleId: string, mediaType: string, base64: string): Promise<void> {
    await ArticleImage.upsert({
      article_id: articleId,
      media_type: mediaType,
      bytes: base64ToBytes(base64),
    });
  }

  /** Persist AI-generated TTS audio bytes for an article. */
  async saveAudio(articleId: string, mediaType: string, base64: string): Promise<void> {
    await ArticleAudio.upsert({
      article_id: articleId,
      media_type: mediaType,
      bytes: base64ToBytes(base64),
    });
  }

  /** Fetch stored image bytes, or `null`. */
  async getImage(articleId: string): Promise<{ mediaType: string; bytes: Buffer } | null> {
    const row = await ArticleImage.findByPk(articleId);
    return row ? { mediaType: row.media_type, bytes: row.bytes } : null;
  }

  /** Fetch stored audio bytes, or `null`. */
  async getAudio(articleId: string): Promise<{ mediaType: string; bytes: Buffer } | null> {
    const row = await ArticleAudio.findByPk(articleId);
    return row ? { mediaType: row.media_type, bytes: row.bytes } : null;
  }

  // ── Read path ──────────────────────────────────────────────────────────────

  /**
   * Load every article, newest first, de-duplicated and with media URLs resolved.
   *
   * The four-way dedup (id, slug, normalised headline, content hash) is what the
   * DO did on every read, and the mobile clients repeat it defensively. The
   * content hash is the one that catches AI variants of the same story that
   * happened to get different slugs.
   */
  async listArticles(origin: string, limit?: number): Promise<NewsArticle[]> {
    const rows = await Article.findAll({
      order: [["published_at", "DESC"]],
      ...(limit && limit > 0 ? { limit } : {}),
    });

    // Which articles actually have stored media — one query each rather than
    // N+1 existence checks per row.
    const [imageIds, audioIds] = await Promise.all([
      this.mediaIdSet(ArticleImage),
      this.mediaIdSet(ArticleAudio),
    ]);

    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const seenHeadlines = new Set<string>();
    const seenHashes = new Set<string>();
    const unique: NewsArticle[] = [];

    for (const r of rows) {
      const normHeadline = normalizedHeadline(r.headline);
      const hash =
        r.content_hash ||
        articleContentHash(r.headline, r.summary, r.category, r.scope);

      if (
        seenIds.has(r.id) ||
        seenSlugs.has(r.slug) ||
        seenHeadlines.has(normHeadline) ||
        (hash && seenHashes.has(hash))
      ) {
        continue;
      }
      seenIds.add(r.id);
      seenSlugs.add(r.slug);
      seenHeadlines.add(normHeadline);
      if (hash) seenHashes.add(hash);

      unique.push(
        this.rewriteAudioUrl(
          this.rewriteImageUrl(this.rowToArticle(r), origin, imageIds),
          origin,
          audioIds,
        ),
      );
    }
    return unique;
  }

  /** Set of article ids that have a row in the given media table. */
  private async mediaIdSet(
    model: typeof ArticleImage | typeof ArticleAudio,
  ): Promise<Set<string>> {
    const rows = await model.findAll({ attributes: ["article_id"], raw: true });
    return new Set(rows.map((r) => (r as unknown as { article_id: string }).article_id));
  }

  /** Apply the feed filters in the same order the Worker did. */
  async getFeed(filter: NewsFeedFilter, origin: string): Promise<NewsArticle[]> {
    await this.ensureSeed();
    let rows = await this.listArticles(origin);

    if (filter.category) rows = rows.filter((a) => a.category === filter.category);
    if (filter.scope) rows = rows.filter((a) => a.scope === filter.scope);

    if (filter.search) {
      const term = filter.search.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.headline.toLowerCase().includes(term) ||
          a.summary.toLowerCase().includes(term),
      );
    }

    if (filter.limit && filter.limit > 0) rows = rows.slice(0, filter.limit);
    return rows;
  }

  /** A single article by slug, with its image URL resolved. */
  async getArticleBySlug(slug: string, origin: string): Promise<NewsArticle | null> {
    await this.ensureSeed();
    const row = await Article.findOne({ where: { slug } });
    if (!row) return null;
    const imageIds = await this.mediaIdSet(ArticleImage);
    return this.rewriteImageUrl(this.rowToArticle(row), origin, imageIds);
  }

  /** The raw row for a slug — used by the translation path. */
  async findRowBySlug(slug: string): Promise<Article | null> {
    return Article.findOne({ where: { slug } });
  }

  /** The raw row for an id. */
  async findRowById(id: string): Promise<Article | null> {
    return Article.findByPk(id);
  }

  /** Top-N reduced payload for the briefings carousel. */
  async getBriefings(
    origin: string,
    limit = DEFAULTS.BRIEFINGS_LIMIT,
  ): Promise<{ briefingTitle: string; data: BriefingItem[] }> {
    await this.ensureSeed();
    const rows = await this.listArticles(origin, limit);
    return {
      briefingTitle: BRIEFING_TITLE,
      data: rows.map((a) => ({
        id: a.id,
        headline: a.headline,
        category: a.category,
        imageUrl: a.imageUrl,
        audioUrl: a.audioUrl,
        publishedAt: a.publishedAt,
      })),
    };
  }

  /**
   * Location-aware feed. When coverage is thin and the reader supplied a place,
   * a fresh local briefing is generated in the background so the next pull is
   * richer — the read itself never waits for it.
   */
  async getLocalFeed(
    req: LocalNewsRequest,
    origin: string,
  ): Promise<{
    total: number;
    nearby: number;
    expandedNearby: boolean;
    location: Pick<LocalNewsRequest, "city" | "region" | "country" | "countryCode">;
    data: NewsArticle[];
  }> {
    await this.ensureSeed();
    const all = await this.listArticles(origin);
    const limit = req.limit ?? DEFAULTS.LOCAL_FEED_LIMIT;
    const ranked: RankedLocalArticle[] = localNewsService.rankLocalFeed(all, req, limit);

    if (ranked.length < 3 && (req.city || req.region || req.country)) {
      runBackground(this.generateLocalBriefing(req, origin), "local briefing generation");
    }

    const nearbyCount = ranked.filter((r) => r.nearby).length;
    return {
      total: ranked.length,
      nearby: nearbyCount,
      expandedNearby: nearbyCount > 0,
      location: {
        city: req.city,
        region: req.region,
        country: req.country,
        countryCode: req.countryCode,
      },
      data: ranked.map((r) => ({ ...r.article, nearby: r.nearby })),
    };
  }

  // ── Row mapping and URL rewriting ──────────────────────────────────────────

  /** Map a database row to the wire shape. */
  rowToArticle(r: Article): NewsArticle {
    const verifiedSources: VerifiedSource[] = Array.isArray(r.verified_sources)
      ? r.verified_sources
      : [];

    // Legacy Unsplash/Picsum ids were removed upstream or return random photos
    // that do not match the story, so they are upgraded to a curated fallback.
    const imageUrl = this.isLegacyImage(r.image_url)
      ? aiGatewayService.fallbackImage(r.category, r.slug, r.headline, r.id)
      : r.image_url;

    return {
      id: r.id,
      slug: r.slug,
      headline: r.headline,
      category: r.category,
      scope: r.scope,
      summary: r.summary,
      content: r.content,
      imageUrl,
      factCheckStatus: r.fact_check_status,
      verifiedSources,
      godlyPrincipleAlignment: r.godly_principle_alignment,
      // Drop the seed placeholder so the read path can substitute the real
      // self-served audio endpoint when TTS bytes exist.
      audioUrl: r.audio_url?.includes(PLACEHOLDER_AUDIO_HOST) ? "" : r.audio_url,
      publishedAt: r.published_at,
      author: r.author,
    };
  }

  private isLegacyImage(url: string): boolean {
    return LEGACY_IMAGE_HOSTS.some((host) => url.startsWith(host));
  }

  /**
   * Resolve the final image URL.
   *
   * Precedence: a verified external image (e.g. Pexels) is left alone; otherwise
   * stored AI bytes are served from the media endpoint; otherwise a deterministic
   * curated fallback, so the feed never renders a broken thumbnail.
   */
  private rewriteImageUrl(
    article: NewsArticle,
    origin: string,
    imageIds: Set<string>,
  ): NewsArticle {
    const endpoint = `${origin}${IMAGE_PATH_PREFIX}${article.id}`;

    if (
      article.imageUrl &&
      article.imageUrl.startsWith("http") &&
      !article.imageUrl.startsWith(endpoint)
    ) {
      return article;
    }

    const useEndpoint =
      !article.imageUrl ||
      article.imageUrl === endpoint ||
      article.imageUrl.startsWith(endpoint);

    if (useEndpoint) {
      if (imageIds.has(article.id)) return { ...article, imageUrl: endpoint };
      return {
        ...article,
        imageUrl: aiGatewayService.fallbackImage(
          article.category,
          article.slug,
          article.headline,
          article.id,
        ),
      };
    }
    return article;
  }

  /**
   * Resolve the final audio URL. Stored TTS is served from the media endpoint;
   * otherwise the field is emptied so the app falls back to device TTS, which is
   * exactly what `app/news/[id].tsx` checks for.
   */
  private rewriteAudioUrl(
    article: NewsArticle,
    origin: string,
    audioIds: Set<string>,
  ): NewsArticle {
    if (audioIds.has(article.id)) {
      return { ...article, audioUrl: `${origin}${AUDIO_PATH_PREFIX}${article.id}` };
    }
    if (!article.audioUrl || article.audioUrl.includes(PLACEHOLDER_AUDIO_HOST)) {
      return { ...article, audioUrl: "" };
    }
    return article;
  }

  // ── Duplicate detection ────────────────────────────────────────────────────

  /**
   * Id of the most recent article that duplicates this story by content hash,
   * slug, or normalised headline within the window. Hash is checked first: it is
   * the cheapest and the most accurate.
   */
  async findRecentDuplicate(
    slug: string,
    headline: string,
    summary: string,
    category: NewsCategory,
    scope: NewsScope,
    sinceMs: number,
  ): Promise<string | null> {
    const sinceIso = new Date(sinceMs).toISOString();
    const hash = articleContentHash(headline, summary, category, scope);

    const byHash = await Article.findOne({
      attributes: ["id"],
      where: { content_hash: hash, published_at: { [Op.gte]: sinceIso } },
      order: [["published_at", "DESC"]],
    });
    if (byHash) return byHash.id;

    const bySlug = await Article.findOne({
      attributes: ["id"],
      where: { slug, published_at: { [Op.gte]: sinceIso } },
      order: [["published_at", "DESC"]],
    });
    if (bySlug) return bySlug.id;

    // Slower headline scan — catches slug variants of the same story.
    const normHeadline = normalizedHeadline(headline);
    const recent = await Article.findAll({
      attributes: ["id", "headline"],
      where: { published_at: { [Op.gte]: sinceIso } },
      order: [["published_at", "DESC"]],
    });
    for (const r of recent) {
      if (normalizedHeadline(r.headline) === normHeadline) return r.id;
    }
    return null;
  }

  /** True when this story was already published inside the window. */
  async publishedRecently(
    slug: string,
    headline: string,
    summary: string,
    category: NewsCategory,
    scope: NewsScope,
    windowHours = DUPLICATE_WINDOW_HOURS,
  ): Promise<boolean> {
    const since = Date.now() - windowHours * 60 * 60 * 1000;
    return (
      (await this.findRecentDuplicate(slug, headline, summary, category, scope, since)) !== null
    );
  }

  /** True when an article with this slug was already published today (UTC day index). */
  async publishedToday(slug: string, dayIdx: number): Promise<boolean> {
    const startIso = new Date(dayIdx * DAY_MS).toISOString();
    const count = await Article.count({
      where: { slug, published_at: { [Op.gte]: startIso } },
    });
    return count > 0;
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  /**
   * Fast user-facing generation. Returns a publishable article immediately;
   * image, audio and translations follow in the background.
   *
   * Returns a discriminated result so the controller can map each outcome to the
   * status code the Worker used (502 for no sources, 200 + `cached` for a
   * duplicate, 201 for a fresh publish).
   */
  async generateArticle(input: {
    topicPrompt: string;
    category: NewsCategory;
    scope: NewsScope;
    origin: string;
  }): Promise<
    | { outcome: "no-sources" }
    | { outcome: "duplicate"; article: NewsArticle }
    | { outcome: "created"; article: NewsArticle }
  > {
    await this.ensureSeed();

    const generated = await aiGatewayService.generateGroundedArticleFast({
      topicPrompt: input.topicPrompt,
      category: input.category,
      scope: input.scope,
    });
    if (!generated) return { outcome: "no-sources" };

    // Already-live story: return the existing article rather than a duplicate.
    const isDuplicate = await this.publishedRecently(
      generated.slug,
      generated.headline,
      generated.summary,
      generated.category,
      generated.scope,
      DUPLICATE_WINDOW_HOURS,
    );

    if (isDuplicate) {
      const existingId = await this.findRecentDuplicate(
        generated.slug,
        generated.headline,
        generated.summary,
        generated.category,
        generated.scope,
        Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000,
      );
      const existingRow = existingId
        ? await Article.findByPk(existingId)
        : await Article.findOne({
            where: { slug: generated.slug },
            order: [["published_at", "DESC"]],
          });

      if (existingRow) {
        const [imageIds, audioIds] = await Promise.all([
          this.mediaIdSet(ArticleImage),
          this.mediaIdSet(ArticleAudio),
        ]);
        const existingArticle = this.rewriteAudioUrl(
          this.rewriteImageUrl(this.rowToArticle(existingRow), input.origin, imageIds),
          input.origin,
          audioIds,
        );
        return { outcome: "duplicate", article: existingArticle };
      }
    }

    const article = await this.persistFastGenerated(generated);

    // Everything expensive happens after the response: the article is already live.
    runBackground(this.generateImageForArticle(article), "article image generation");
    runBackground(this.generateAudioForArticle(article), "article audio generation");
    runBackground(translationService.pretranslateAll(article.id), "article pre-translation");

    return { outcome: "created", article };
  }

  /** Persist a fast-generated article (curated fallback image already set). */
  private async persistFastGenerated(generated: FastGeneratedArticle): Promise<NewsArticle> {
    const article: NewsArticle = {
      id: generated.id,
      slug: generated.slug,
      headline: generated.headline,
      category: generated.category,
      scope: generated.scope,
      summary: generated.summary,
      content: generated.content,
      imageUrl: generated.imageUrl,
      factCheckStatus: generated.factCheckStatus,
      verifiedSources: generated.verifiedSources,
      godlyPrincipleAlignment: generated.godlyPrincipleAlignment,
      audioUrl: generated.audioUrl,
      publishedAt: generated.publishedAt,
      author: generated.author,
      contentHash: generated.contentHash,
    };
    await this.upsertArticle(article);
    return article;
  }

  /** Persist a depth-path article together with its AI image bytes. */
  private async persistGenerated(
    generated: GeneratedArticle,
    origin: string,
  ): Promise<NewsArticle> {
    const hasAiImage = Boolean(generated.imageBase64 && generated.imageMediaType);
    if (hasAiImage) {
      await this.saveImage(
        generated.id,
        generated.imageMediaType as string,
        generated.imageBase64 as string,
      );
    }

    const imageUrl = hasAiImage
      ? `${origin}${IMAGE_PATH_PREFIX}${generated.id}`
      : generated.imageUrl ||
        aiGatewayService.fallbackImage(
          generated.category,
          generated.slug,
          generated.headline,
          generated.id,
        );

    const article: NewsArticle = {
      id: generated.id,
      slug: generated.slug,
      headline: generated.headline,
      category: generated.category,
      scope: generated.scope,
      summary: generated.summary,
      content: generated.content,
      imageUrl,
      factCheckStatus: generated.factCheckStatus,
      verifiedSources: generated.verifiedSources,
      godlyPrincipleAlignment: generated.godlyPrincipleAlignment,
      audioUrl: generated.audioUrl,
      publishedAt: generated.publishedAt,
      author: generated.author,
      contentHash: generated.contentHash,
    };
    await this.upsertArticle(article);
    return article;
  }

  /** Generate and store the unique image, then clear `image_url` so reads use it. */
  async generateImageForArticle(article: NewsArticle): Promise<void> {
    if (!aiGatewayService.isEnabled) return;
    const image = await aiGatewayService.generateArticleImage(
      "",
      article.headline,
      article.category,
      article.scope,
    );
    if (!image) return;

    await this.saveImage(article.id, image.mediaType, image.base64);
    await Article.update({ image_url: "" }, { where: { id: article.id } });
  }

  /** Generate and store the TTS briefing for an already-published article. */
  async generateAudioForArticle(article: NewsArticle): Promise<void> {
    if (!aiGatewayService.isEnabled) return;
    const audio = await aiGatewayService.generateArticleAudio(
      article.headline,
      article.summary,
    );
    if (!audio) return;
    await this.saveAudio(article.id, audio.mediaType, audio.base64);
  }

  /**
   * Generate a location-specific briefing in the background so a thin local feed
   * fills out on the next pull.
   */
  private async generateLocalBriefing(
    req: LocalNewsRequest,
    origin: string,
  ): Promise<void> {
    if (!aiGatewayService.isEnabled) return;
    if (!req.city && !req.region && !req.country) return;

    const generated = await aiGatewayService
      .generateGroundedArticleFast({
        topicPrompt: localNewsService.buildLocalPrompt(req),
        category: "local-national-politics-civic",
        scope: "local",
      })
      .catch(() => null);
    if (!generated) return;

    // Don't add another local briefing if an identical one is already live.
    const duplicate = await this.publishedRecently(
      generated.slug,
      generated.headline,
      generated.summary,
      generated.category,
      generated.scope,
      DUPLICATE_WINDOW_HOURS,
    );
    if (duplicate) return;

    const article = await this.persistFastGenerated(generated);
    runBackground(this.generateImageForArticle(article), "local briefing image");
    runBackground(this.generateAudioForArticle(article), "local briefing audio");
    runBackground(translationService.pretranslateAll(article.id), "local briefing translations");
  }

  /**
   * Run one daily batch: pick today's prompts, generate them in parallel, skip
   * anything already published today, and insert the survivors.
   *
   * Called by the cron job and by `POST /news/refresh-daily`. Idempotent unless
   * `force` is set.
   */
  async runDailyBatch(force: boolean, origin: string): Promise<DailyBatchResult> {
    await this.ensureSeed();
    const dayIdx = dayIndexAt();
    const batch = pickDailyBatch(dayIdx, DAILY_BATCH_SIZE);
    const slugs: string[] = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    if (!aiGatewayService.isEnabled) {
      logger.warn("[news] daily batch skipped — AI gateway not configured");
      return {
        dayIndex: dayIdx,
        attempted: batch.length,
        generated,
        skipped,
        failed: batch.length,
        slugs,
      };
    }

    // Parallel: each prompt runs its own search + synthesis + image generation.
    const results = await Promise.all(
      batch.map((p) =>
        aiGatewayService
          .generateGroundedArticle({
            topicPrompt: p.prompt,
            category: p.category,
            scope: p.scope,
          })
          .catch(() => null),
      ),
    );

    for (const gen of results) {
      if (!gen) {
        failed++;
        continue;
      }
      if (!force && (await this.publishedToday(gen.slug, dayIdx))) {
        skipped++;
        continue;
      }
      const article = await this.persistGenerated(gen, origin);
      runBackground(this.generateAudioForArticle(article), "daily batch audio");
      slugs.push(gen.slug);
      generated++;
    }

    logger.info("[news] daily batch complete", {
      dayIndex: dayIdx,
      attempted: batch.length,
      generated,
      skipped,
      failed,
    });

    return { dayIndex: dayIdx, attempted: batch.length, generated, skipped, failed, slugs };
  }

  // ── Maintenance ────────────────────────────────────────────────────────────

  /**
   * Remove duplicate articles sharing a slug, normalised headline, or content
   * hash, keeping the most recent copy. Orphaned images, audio and translations
   * go with them.
   *
   * This is a hard delete despite `Article` being paranoid: a duplicate row is
   * not history worth keeping, and leaving it soft-deleted would keep its media
   * rows alive too.
   */
  async pruneDuplicates(): Promise<PruneDuplicatesResult> {
    const rows = await Article.findAll({ order: [["published_at", "DESC"]] });

    const seenSlugs = new Set<string>();
    const seenHeadlines = new Set<string>();
    const seenHashes = new Set<string>();
    const idsToDelete: string[] = [];

    for (const r of rows) {
      const normHeadline = normalizedHeadline(r.headline);
      const hash =
        r.content_hash || articleContentHash(r.headline, r.summary, r.category, r.scope);
      const isDuplicate =
        seenSlugs.has(r.slug) ||
        seenHeadlines.has(normHeadline) ||
        (Boolean(hash) && seenHashes.has(hash));

      if (isDuplicate) {
        idsToDelete.push(r.id);
      } else {
        seenSlugs.add(r.slug);
        seenHeadlines.add(normHeadline);
        if (hash) seenHashes.add(hash);
      }
    }

    if (idsToDelete.length === 0) {
      return {
        scanned: rows.length,
        removed: 0,
        removedImages: 0,
        removedAudio: 0,
        removedTranslations: 0,
      };
    }

    return sequelize.transaction(async (transaction) => {
      const where = { article_id: { [Op.in]: idsToDelete } };
      const removedImages = await ArticleImage.destroy({ where, transaction });
      const removedAudio = await ArticleAudio.destroy({ where, transaction });
      const removedTranslations = await ArticleTranslation.destroy({ where, transaction });
      const removed = await Article.destroy({
        where: { id: { [Op.in]: idsToDelete } },
        force: true,
        transaction,
      });

      logger.info("[news] pruned duplicates", { scanned: rows.length, removed });
      return {
        scanned: rows.length,
        removed,
        removedImages,
        removedAudio,
        removedTranslations,
      };
    });
  }

  /**
   * Backfill AI images for rows still pointing at legacy stock photos or at a
   * media endpoint whose bytes are missing.
   *
   * Idempotent: rows that already have stored bytes are skipped. `limit` bounds
   * the work per call — the Worker needed that to stay inside its wall-clock
   * budget, and it is kept because it also bounds gateway spend per invocation.
   */
  async backfillImages(limit = DEFAULTS.BACKFILL_IMAGES_LIMIT): Promise<BackfillImagesResult> {
    if (!aiGatewayService.isEnabled) {
      return { attempted: 0, upgraded: 0, skipped: 0, failed: 0 };
    }

    const candidates = await Article.findAll({ order: [["published_at", "DESC"]] });
    const existingImages = await this.mediaIdSet(ArticleImage);

    const toUpgrade = candidates.filter((r) => {
      if (existingImages.has(r.id)) return false;
      const isLegacy = this.isLegacyImage(r.image_url);
      const pointsAtMissingEndpoint = r.image_url.includes(IMAGE_PATH_PREFIX);
      return isLegacy || pointsAtMissingEndpoint;
    });

    const slice = toUpgrade.slice(0, limit);
    const skipped = candidates.length - toUpgrade.length;
    let upgraded = 0;
    let failed = 0;

    const processOne = async (row: Article): Promise<void> => {
      // One retry absorbs a transient gateway 5xx without a sleep backoff.
      for (let attempt = 1; attempt <= BACKFILL_IMAGE_MAX_ATTEMPTS; attempt++) {
        const image = await aiGatewayService.generateArticleImage(
          "",
          row.headline,
          row.category,
          row.scope,
        );
        if (image) {
          await this.saveImage(row.id, image.mediaType, image.base64);
          await Article.update({ image_url: "" }, { where: { id: row.id } });
          upgraded++;
          return;
        }
      }
      failed++;
    };

    for (let i = 0; i < slice.length; i += CONCURRENCY.BACKFILL_IMAGES) {
      const chunk = slice.slice(i, i + CONCURRENCY.BACKFILL_IMAGES);
      await Promise.allSettled(chunk.map(processOne));
    }

    return {
      attempted: slice.length,
      upgraded,
      skipped,
      failed,
      remaining: toUpgrade.length - slice.length,
    };
  }

  /** Ids of the most recent N articles — the translation-backfill work list. */
  async recentArticleIds(limit: number): Promise<string[]> {
    const rows = await Article.findAll({
      attributes: ["id"],
      order: [["published_at", "DESC"]],
      limit,
    });
    return rows.map((r) => r.id);
  }

  /** Delegate to the translation service so the controller has one entry point. */
  async backfillTranslations(articleIds: string[]): Promise<BackfillTranslationsResult> {
    return translationService.backfillTranslations(articleIds);
  }

  /** Total article count — used by the health/stats surface. */
  async count(): Promise<number> {
    return Article.count();
  }
}

export const newsService = new NewsService();
export default newsService;
