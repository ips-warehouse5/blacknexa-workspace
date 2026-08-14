/**
 * Rate limiting.
 *
 * The Worker had none, so every endpoint — including the AI generation path that
 * costs real money per call — could be hammered without limit.
 *
 * Four tiers, because the routes have genuinely different risk profiles:
 *   • `authLimiter`  — very tight, keyed by IP + email. Brute-force defence.
 *   • `writeLimiter` — protects the expensive/side-effecting paths: article
 *     generation, tipping, incident creation, beacon triggers.
 *   • `readLimiter`  — generous, for the feed reads the apps poll.
 *   • `apiLimiter`   — the overall per-IP budget across `/api/v1`.
 *
 * `keyGenerator` uses `req.ip`, which is only the real client address when
 * `TRUST_PROXY` is set correctly behind a load balancer — otherwise every request
 * shares the proxy's IP and the limits become global rather than per-client.
 */

import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";

/** Shared 429 response, in the legacy error envelope the clients read. */
function limitHandler(name: string) {
  return (req: Request, res: Parameters<Options["handler"]>[1]): void => {
    logger.warn("[rate-limit] request throttled", {
      limiter: name,
      ip: req.ip,
      path: req.originalUrl,
    });
    res.status(429).json({
      success: false,
      error: "Too many requests. Please slow down and try again shortly.",
    });
  };
}

const shared = {
  windowMs: env.rateLimit.windowMs,
  standardHeaders: true,
  legacyHeaders: false,
  // Health checks and CORS preflights should never consume a client's budget.
  skip: (req: Request) => req.method === "OPTIONS" || req.path === "/ping",
};

/** Overall per-IP budget across the API. */
export const apiLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.max,
  handler: limitHandler("api"),
});

/** Generous limit for public feed reads that the apps poll on focus. */
export const readLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.readMax,
  handler: limitHandler("read"),
});

/** Tight limit for expensive or side-effecting writes. */
export const writeLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.writeMax,
  handler: limitHandler("write"),
});

/**
 * Brute-force guard for authentication.
 *
 * Keyed by IP **and** submitted email, so one attacker cannot lock out a whole
 * NAT range by burning the shared IP budget, and cannot rotate emails to get more
 * attempts against the same address either.
 */
export const authLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.authMax,
  keyGenerator: (req: Request) => {
    const email =
      typeof (req.body as { email?: unknown } | undefined)?.email === "string"
        ? ((req.body as { email: string }).email).toLowerCase()
        : "anonymous";
    return `${req.ip ?? "unknown"}:${email}`;
  },
  // A successful login should not count against the remaining budget.
  skipSuccessfulRequests: true,
  handler: limitHandler("auth"),
});

/**
 * Limiter for inbound provider webhooks.
 *
 * Higher than the write tier because Stripe legitimately bursts and retries, but
 * still bounded so a spoofed flood cannot exhaust the database connection pool.
 */
export const webhookLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  max: 120,
  handler: limitHandler("webhook"),
});
