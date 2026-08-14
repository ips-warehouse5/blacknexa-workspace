/**
 * CORS policy.
 *
 * The Worker used `Access-Control-Allow-Origin: *`. That is replaced with an
 * explicit allowlist driven by `CORS_ORIGINS`; a wildcard is rejected at boot in
 * production (see env.config.ts).
 *
 * Requests with no `Origin` header are allowed. That is not a loophole: native
 * mobile clients (the Expo app and the iOS app, which are the primary consumers)
 * and server-to-server callers such as the Stripe webhook never send one, and the
 * browser same-origin policy is what CORS protects — it does not apply to them.
 */

import type { CorsOptions } from "cors";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";

/** Headers the clients actually send. Kept identical to the Worker's list. */
const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "Idempotency-Key",
  "X-Tos-Version",
  "X-Requested-With",
  "Accept",
  "Accept-Language",
];

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Native app / curl / webhook — no Origin header to police.
    if (!origin) return callback(null, true);

    if (env.corsOrigins.includes(origin)) return callback(null, true);

    // Outside production, allow localhost on any port so Expo web and the
    // dev tooling work without constant .env edits.
    if (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    logger.warn("[cors] blocked origin", { origin });
    // Reject by omitting the header rather than throwing, so the browser gets a
    // clean CORS failure instead of a 500 from the error handler.
    return callback(null, false);
  },
  methods: ALLOWED_METHODS,
  allowedHeaders: ALLOWED_HEADERS,
  exposedHeaders: ["Content-Length", "Content-Type", "RateLimit-Limit", "RateLimit-Remaining"],
  credentials: true,
  maxAge: 86_400,
  optionsSuccessStatus: 204,
};

export default corsOptions;
