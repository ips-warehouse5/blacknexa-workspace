/**
 * Domain constants ported from the Worker.
 *
 * These values are visible in responses or drive behaviour the clients depend
 * on, so they are kept verbatim rather than re-tuned.
 */

/** Milliseconds in a day — used by the day-index rotation and dedup windows. */
export const DAY_MS = 86_400_000;

/** Self-served media URL prefixes. The clients test for these exact paths. */
export const IMAGE_PATH_PREFIX = "/api/v1/news/image/";
export const AUDIO_PATH_PREFIX = "/api/v1/news/audio/";

/** Legacy stock-photo hosts whose URLs are upgraded to a curated fallback on read. */
export const LEGACY_IMAGE_HOSTS = ["https://images.unsplash.com/", "https://picsum.photos/"];

/** The placeholder audio host the seed data uses; treated as "no audio". */
export const PLACEHOLDER_AUDIO_HOST = "cdn.blacknexa.org";

/** Title shown above the briefings carousel. */
export const BRIEFING_TITLE = "Blacknexa Daily Truth & Stewardship Briefing";

/** Author attributed to AI-generated briefings. */
export const AI_AUTHOR = "Blacknexa AI Fact Engine";

/** Fact-check badge on AI-generated briefings. */
export const FACT_CHECK_VERIFIED = "100% FACTUALLY VERIFIED";

/** IndexNow verification key and its file path. */
export const INDEXNOW_KEY = "blacknexanews2026indexnowkey";
export const INDEXNOW_KEY_PATH = "/blacknexanews2026indexnowkey.txt";

/** Duplicate-suppression window for generated briefings, in hours. */
export const DUPLICATE_WINDOW_HOURS = 24;

/**
 * Default page sizes and batch limits, matching the Worker's defaults exactly.
 *
 * Not `as const`: these are used as fallbacks for caller-supplied numbers, so they
 * must widen to `number` rather than narrow to literal types.
 */
export const DEFAULTS: Readonly<Record<string, number>> = {
  BRIEFINGS_LIMIT: 3,
  LOCAL_FEED_LIMIT: 8,
  PLATFORM_FEED_LIMIT: 20,
  CREATORS_LIMIT: 20,
  TIPS_LIMIT: 50,
  LEDGER_LIMIT: 100,
  PAYOUTS_LIMIT: 50,
  SNAPSHOTS_LIMIT: 20,
  BACKFILL_IMAGES_LIMIT: 4,
  BACKFILL_TRANSLATIONS_LIMIT: 10,
  QUEUE_DRAIN_LIMIT: 5,
  QUEUE_PRUNE_DAYS: 7,
  ENTERPRISE_FEED_LIMIT: 100,
  SNAPSHOT_RETENTION: 50,
};

/** Concurrency caps for the batch AI paths, ported from the Worker. */
export const CONCURRENCY = {
  PRETRANSLATE: 4,
  BACKFILL_TRANSLATIONS: 3,
  BACKFILL_IMAGES: 2,
} as const;

/** Retry attempts for a single image backfill row. */
export const BACKFILL_IMAGE_MAX_ATTEMPTS = 2;

/** Enterprise engine version string returned by `GET /blacknexa/stats`. */
export const ENTERPRISE_VERSION = "2027.10-GLOBAL-PRODUCTION-SECURE";

/** Enterprise engine origin returned by `GET /blacknexa/stats`. */
export const ENTERPRISE_ORIGIN = "https://blacknexa.com";

/** Minimum narrative length enforced by the enterprise story guardrail. */
export const ENTERPRISE_MIN_CONTENT_CHARS = 600;

/** Padding appended when a narrative falls short of the minimum. */
export const ENTERPRISE_PADDING =
  " Further historical and contextual analysis reveals that systemic factors " +
  "directly influence these outcomes, necessitating active civic participation, " +
  "transparent documentation, and community-driven safeguards to ensure sustained progress.";

/** Locale catalogue returned by `GET /platform/news/locales`. */
export const PLATFORM_LOCALES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
] as const;

/** Currencies quoted by `GET /platform/tipping/fees`, in the Worker's order. */
export const SUPPORTED_TIP_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "KES",
  "NGN",
  "ZAR",
  "BRL",
  "INR",
  "CNY",
  "GHS",
  "ETB",
] as const;
