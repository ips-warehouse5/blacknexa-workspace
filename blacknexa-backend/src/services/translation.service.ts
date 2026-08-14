/**
 * Translation service — the article-translation cache and its backfill paths.
 *
 * Ported from the NewsStore Durable Object's translation logic. The read
 * behaviour is deliberately non-blocking:
 *
 *   • `lang=en` short-circuits to the source text with no model call.
 *   • A cache hit returns instantly with `cached: true`.
 *   • A cache **miss** returns the English source immediately with
 *     `background: true` and kicks off a full pre-translation. The reader is
 *     never left staring at a spinner while a 900-word briefing is translated,
 *     and their next visit is instant.
 *
 * That last behaviour is what `NewsProvider.fetchTranslation()` in the app is
 * written against, so it is preserved exactly.
 */

import { Op } from "sequelize";
import logger from "@/utils/logger.util";
import Article from "@/models/article.model";
import ArticleTranslation from "@/models/article_translation.model";
import i18nService from "@/services/i18n.service";
import { CONCURRENCY } from "@/config/constants";
import type { ArticleTranslation as ArticleTranslationDto, LanguageCode } from "@/types/i18n.interface";
import type { BackfillTranslationsResult } from "@/types/news.interface";

class TranslationService {
  /** Read a cached translation, or `null`. */
  async readTranslation(
    articleId: string,
    language: LanguageCode,
  ): Promise<ArticleTranslationDto | null> {
    const row = await ArticleTranslation.findOne({
      where: { article_id: articleId, language },
    });
    if (!row) return null;
    return {
      language: row.language,
      headline: row.headline,
      summary: row.summary,
      content: row.content,
      godlyPrincipleAlignment: row.godly_principle_alignment,
      translatedAt: row.translated_at,
    };
  }

  /** Cache a translated view. */
  async saveTranslation(
    articleId: string,
    t: ArticleTranslationDto,
  ): Promise<void> {
    await ArticleTranslation.upsert({
      article_id: articleId,
      language: t.language,
      headline: t.headline,
      summary: t.summary,
      content: t.content,
      godly_principle_alignment: t.godlyPrincipleAlignment,
      translated_at: t.translatedAt,
    });
  }

  /** The English source text, shaped as a translation payload. */
  buildEnglishView(row: Article): ArticleTranslationDto {
    return {
      language: "en",
      headline: row.headline,
      summary: row.summary,
      content: row.content,
      godlyPrincipleAlignment: row.godly_principle_alignment,
      translatedAt: row.published_at,
    };
  }

  /**
   * Translate one article on demand and cache it. Used by the generation path,
   * where the reader has explicitly asked for a non-English briefing and is
   * already waiting on the response, so a synchronous translation is warranted.
   */
  async translateAndCache(
    articleId: string,
    language: LanguageCode,
    source: {
      headline: string;
      summary: string;
      content: string;
      godlyPrincipleAlignment: string;
    },
  ): Promise<ArticleTranslationDto | null> {
    const translation = await i18nService.translateArticle({ language, ...source });
    if (translation) {
      await this.saveTranslation(articleId, translation);
    }
    return translation;
  }

  /**
   * Eagerly translate an article into every supported non-English language.
   *
   * Runs a small concurrency pool so neither the database nor the gateway is
   * overwhelmed, and swallows per-language failures so one bad call cannot abort
   * the rest of the batch.
   */
  async pretranslateAll(articleId: string): Promise<void> {
    const row = await Article.findByPk(articleId);
    if (!row) return;

    const targets = i18nService.translationTargets;
    const source = {
      headline: row.headline,
      summary: row.summary,
      content: row.content,
      godlyPrincipleAlignment: row.godly_principle_alignment,
    };

    const translateOne = async (language: LanguageCode): Promise<void> => {
      if (await this.readTranslation(articleId, language)) return;
      const t = await i18nService.translateArticle({ language, ...source });
      if (t) await this.saveTranslation(articleId, t);
    };

    for (let i = 0; i < targets.length; i += CONCURRENCY.PRETRANSLATE) {
      const chunk = targets.slice(i, i + CONCURRENCY.PRETRANSLATE);
      await Promise.allSettled(chunk.map(translateOne));
    }
  }

  /**
   * Backfill missing translations for a list of articles, skipping pairs that are
   * already cached. Returns the same counters the Worker reported.
   */
  async backfillTranslations(articleIds: string[]): Promise<BackfillTranslationsResult> {
    const targets = i18nService.translationTargets;
    let translated = 0;
    let failed = 0;

    const translateArticle = async (articleId: string): Promise<void> => {
      const row = await Article.findByPk(articleId);
      if (!row) return;
      const source = {
        headline: row.headline,
        summary: row.summary,
        content: row.content,
        godlyPrincipleAlignment: row.godly_principle_alignment,
      };
      for (const language of targets) {
        if (await this.readTranslation(articleId, language)) continue;
        const t = await i18nService.translateArticle({ language, ...source });
        if (t) {
          await this.saveTranslation(articleId, t);
          translated++;
        } else {
          failed++;
        }
      }
    };

    for (let i = 0; i < articleIds.length; i += CONCURRENCY.BACKFILL_TRANSLATIONS) {
      const chunk = articleIds.slice(i, i + CONCURRENCY.BACKFILL_TRANSLATIONS);
      await Promise.allSettled(chunk.map(translateArticle));
    }

    const skipped = articleIds.length * targets.length - translated - failed;
    logger.info("[translation] backfill complete", {
      attempted: articleIds.length,
      translated,
      failed,
    });
    return { attempted: articleIds.length, translated, skipped, failed };
  }

  /** Delete every cached translation for an article. */
  async deleteForArticles(articleIds: string[]): Promise<number> {
    if (articleIds.length === 0) return 0;
    return ArticleTranslation.destroy({ where: { article_id: { [Op.in]: articleIds } } });
  }
}

export const translationService = new TranslationService();
export default translationService;
