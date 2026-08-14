/**
 * News request schemas.
 *
 * Written against what `NewsProvider.tsx` and `LocationProvider.tsx` actually
 * send. Notably:
 *   • `GET /feed` — `category`, `scope`, `search`, `limit`, all optional. The app
 *     sends `?limit=50` and `?search=…&limit=50`.
 *   • `POST /generate` — the app always sends `language`, and defaults
 *     `category`/`scope` were applied server-side in the Worker, so they stay
 *     optional with the same defaults.
 *   • `GET /local` — the app sends every field including empty strings for a
 *     partial location fix, so the place fields allow `""`.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { ALL_NEWS_CATEGORIES, ALL_NEWS_SCOPES } from "@/types/news.interface";
import { SUPPORTED_LANGUAGES } from "@/services/i18n.service";

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/** A slug is URL-safe and bounded — it is used in a path segment. */
const slugParam = Joi.string().trim().min(1).max(255).required();

export const newsSchemas: SchemaRegistry = {
  "news.feed": {
    query: Joi.object({
      category: Joi.string().valid(...ALL_NEWS_CATEGORIES).optional(),
      scope: Joi.string().valid(...ALL_NEWS_SCOPES).optional(),
      // Bounded so a search term cannot be used to push a huge scan.
      search: Joi.string().trim().max(200).allow("").optional(),
      limit: Joi.number().integer().min(1).max(200).optional(),
    }),
  },

  "news.local": {
    query: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
      city: Joi.string().trim().max(120).allow("").optional(),
      region: Joi.string().trim().max(120).allow("").optional(),
      country: Joi.string().trim().max(120).allow("").optional(),
      countryCode: Joi.string().trim().uppercase().max(8).allow("").optional(),
      // The app sends the string "true"/"false"; Joi's convert handles both.
      nearby: Joi.boolean().truthy("true", "1").falsy("false", "0").optional(),
      limit: Joi.number().integer().min(1).max(50).optional(),
    }),
  },

  "news.briefings": {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(20).optional(),
    }),
  },

  "news.articleBySlug": {
    params: Joi.object({ slug: slugParam }),
  },

  "news.mediaById": {
    params: Joi.object({
      articleId: Joi.string().trim().min(1).max(128).required(),
    }),
  },

  "news.translate": {
    params: Joi.object({ slug: slugParam }),
    query: Joi.object({
      lang: Joi.string()
        .valid(...LANGUAGE_CODES)
        .default("en")
        .messages({
          "any.only": `lang must be one of: ${LANGUAGE_CODES.join(", ")}`,
        }),
    }),
  },

  "news.generate": {
    body: Joi.object({
      topicPrompt: Joi.string().trim().min(3).max(1000).required().messages({
        "any.required": "topicPrompt is required",
        "string.empty": "topicPrompt is required",
      }),
      // The Worker defaulted these when absent; the same defaults are applied here.
      category: Joi.string()
        .valid(...ALL_NEWS_CATEGORIES)
        .default("business-wealth-stewardship"),
      scope: Joi.string().valid(...ALL_NEWS_SCOPES).default("national"),
      // An unsupported code falls back to English rather than failing the request,
      // matching `isSupportedLanguage(...) ? lang : "en"` in the original.
      language: Joi.string().max(16).default("en"),
    }),
  },

  "news.refreshDaily": {
    query: Joi.object({
      force: Joi.boolean().truthy("1", "true").falsy("0", "false").default(false),
    }),
  },

  "news.backfillImages": {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(4),
    }),
  },

  "news.backfillTranslations": {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(10),
    }),
  },

  "news.schemaJson": {
    params: Joi.object({ slug: slugParam }),
  },
};

export default newsSchemas;
