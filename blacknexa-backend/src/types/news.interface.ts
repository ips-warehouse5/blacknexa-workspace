/**
 * News domain types.
 *
 * Mirrors the Expo app's `mocks/news.ts` model and the Worker's `_lib/types.ts`
 * so the mobile clients and this API speak exactly the same shape. Any change
 * here is a breaking change for both apps.
 */

export type NewsCategory =
  | "business-wealth-stewardship"
  | "local-national-politics-civic"
  | "education-youth-advancement"
  | "clean-tech-and-advancements"
  | "faith-commandments-morality"
  | "hbcu-education"
  | "breaking-geopolitical"
  | "civil-rights-police-accountability";

export type NewsScope = "local" | "national" | "global";

/** Incident categories — mirrors the Expo `mocks/incidents.ts` model. */
export type IncidentCategory =
  | "profiling"
  | "housing"
  | "workplace"
  | "policing"
  | "education"
  | "medical"
  | "harassment";

export interface VerifiedSource {
  name: string;
  url: string;
  /** Short excerpt from the source used as raw factual backing for the article. */
  excerpt?: string;
  /** ISO date the source was published, when known. */
  publishedDate?: string;
}

/** The article payload as returned to clients. Field order matters for nothing; keys do. */
export interface NewsArticle {
  id: string;
  slug: string;
  headline: string;
  category: NewsCategory;
  scope: NewsScope;
  summary: string;
  content: string;
  imageUrl: string;
  factCheckStatus: string;
  verifiedSources: VerifiedSource[];
  godlyPrincipleAlignment: string;
  audioUrl: string;
  publishedAt: string;
  author: string;
  /** Stable content fingerprint used to merge duplicate briefings. */
  contentHash?: string;
  /** Present only on local-feed results that matched a neighbouring city. */
  nearby?: boolean;
}

/** Filters accepted by `GET /api/v1/news/feed`. */
export interface NewsFeedFilter {
  category?: NewsCategory;
  scope?: NewsScope;
  search?: string;
  limit?: number;
}

/** Request body for `POST /api/v1/news/generate`. */
export interface GenerateArticleDto {
  topicPrompt: string;
  category?: NewsCategory;
  scope?: NewsScope;
  /** ISO language code — when set, the briefing is returned natively translated. */
  language?: string;
}

/** Reduced payload used by the briefings carousel. */
export interface BriefingItem {
  id: string;
  headline: string;
  category: NewsCategory;
  imageUrl: string;
  audioUrl: string;
  publishedAt: string;
}

/** Query for `GET /api/v1/news/local`. */
export interface LocalNewsRequest {
  lat?: number;
  lng?: number;
  city?: string;
  region?: string;
  country?: string;
  /** ISO-2 country code when available (e.g. "US"). */
  countryCode?: string;
  /** When true, expand matching to adjacent/nearby cities. */
  nearby?: boolean;
  limit?: number;
}

/** One ranked local-feed result. */
export interface RankedLocalArticle {
  article: NewsArticle;
  nearby: boolean;
}

/** Result summary of a daily generation batch. */
export interface DailyBatchResult {
  dayIndex: number;
  attempted: number;
  generated: number;
  skipped: number;
  failed: number;
  slugs: string[];
}

/** Result summary of the duplicate-pruning pass. */
export interface PruneDuplicatesResult {
  scanned: number;
  removed: number;
  removedImages: number;
  removedAudio: number;
  removedTranslations: number;
}

/** Result summary of the image backfill pass. */
export interface BackfillImagesResult {
  attempted: number;
  upgraded: number;
  skipped: number;
  failed: number;
  remaining?: number;
}

/** Result summary of the translation backfill pass. */
export interface BackfillTranslationsResult {
  attempted: number;
  translated: number;
  skipped: number;
  failed: number;
}

/** Public origin used for self-referential URLs in RSS / JSON-LD / podcast. */
export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  "business-wealth-stewardship": "Wealth",
  "local-national-politics-civic": "Civic",
  "education-youth-advancement": "Education",
  "clean-tech-and-advancements": "Innovation",
  "faith-commandments-morality": "Faith",
  "hbcu-education": "HBCU",
  "breaking-geopolitical": "Breaking",
  "civil-rights-police-accountability": "Civil Rights",
};

export const ALL_NEWS_CATEGORIES: NewsCategory[] = Object.keys(
  CATEGORY_LABELS,
) as NewsCategory[];

export const ALL_NEWS_SCOPES: NewsScope[] = ["local", "national", "global"];

export const ALL_INCIDENT_CATEGORIES: IncidentCategory[] = [
  "profiling",
  "housing",
  "workplace",
  "policing",
  "education",
  "medical",
  "harassment",
];
