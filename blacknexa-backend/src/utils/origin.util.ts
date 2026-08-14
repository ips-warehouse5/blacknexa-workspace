/**
 * Resolve the origin used to build self-served media URLs.
 *
 * The Durable Object derived this from the incoming request URL, and hardcoded
 * `https://blacknexa-backend.rork.app` in two background paths where no request
 * was available. Behind a reverse proxy the request-derived value is wrong (it
 * reports the internal host and scheme), which would emit image and audio URLs the
 * apps cannot reach.
 *
 * So `PUBLIC_API_ORIGIN` wins when set — and env validation requires it in
 * production. The request-derived value is the development fallback.
 */

import type { Request } from "express";
import env from "@/config/env.config";

/** Origin for URLs returned to a client, e.g. `https://api.blacknexa.com`. */
export function resolveOrigin(req: Request): string {
  if (env.publicApiOrigin) return env.publicApiOrigin;

  // `req.protocol` and `req.host` already honour X-Forwarded-* when the app has
  // `trust proxy` set, which is driven by TRUST_PROXY.
  const host = req.get("host") ?? `localhost:${env.port}`;
  return `${req.protocol}://${host}`;
}

/**
 * Origin for background work, where there is no request to derive one from
 * (the daily cron batch, thin-coverage local briefing generation).
 */
export function backgroundOrigin(): string {
  return env.publicApiOrigin || `http://localhost:${env.port}`;
}
