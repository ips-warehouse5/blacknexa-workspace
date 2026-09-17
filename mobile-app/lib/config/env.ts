/**
 * Single source of truth for environment-driven configuration.
 *
 * Every value here comes from `EXPO_PUBLIC_*` variables, which Expo inlines
 * into the client bundle from `.env.development` / `.env.production` (loaded
 * automatically based on the active `NODE_ENV`, driven per EAS build profile
 * by `eas.json`, and by the local dev command otherwise). Nothing here should
 * ever be a literal URL — if a new backend value is needed, add it to
 * `.env.example`, both `.env.*` files, and read it through this module so
 * there is exactly one place that resolves environment configuration.
 */

export type AppEnv = "development" | "production";

function normalizeUrl(name: string, url: string): string {
  // A typo like "KEY==https://..." in a .env file parses as the value
  // "=https://..." — a syntactically-invalid URL that `fetch` rejects at
  // call time with a generic, misleading "offline" error. Catching it here
  // instead fails loudly at startup with the actual cause.
  try {
    new URL(url);
  } catch {
    throw new Error(`[env] "${name}" is not a valid URL: "${url}". Check .env.${APP_ENV} for a typo.`);
  }
  return url.replace(/\/+$/, "");
}

function readAppEnv(): AppEnv {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  if (raw === "production" || raw === "development") return raw;
  // Falls back to the bundler's own notion of dev vs. release so a build
  // never silently runs unconfigured — see `requireEnv` below.
  return __DEV__ ? "development" : "production";
}

/** The environment this build was configured for, independent of `__DEV__`. */
export const APP_ENV: AppEnv = readAppEnv();

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable "${name}" for APP_ENV="${APP_ENV}". ` +
        `Confirm .env.${APP_ENV} defines it and that the correct EAS build profile / start script is in use.`,
    );
  }
  return value;
}

/**
 * The BlackNexa API origin. Required — there is no localhost fallback, so a
 * misconfigured build fails loudly at startup instead of quietly talking to
 * the wrong backend.
 */
export const API_BASE_URL = normalizeUrl(
  "EXPO_PUBLIC_API_BASE_URL",
  requireEnv("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL),
);

/**
 * The BlackNexa News/Syndication Cloudflare Worker origin, consumed by
 * NewsProvider and GeoLegalProvider. Defaults to `API_BASE_URL` so a single
 * backend deployment (the common case) only needs one URL configured.
 */
export const RORK_FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL
  ? normalizeUrl("EXPO_PUBLIC_RORK_FUNCTIONS_URL", process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL)
  : API_BASE_URL;
