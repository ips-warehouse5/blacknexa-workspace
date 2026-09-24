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
 *
 * ── Per-member limiters (docs/INCIDENT_MODULE_PLAN.md §7.6, §7.9) ──────────
 * Two budgets are keyed by the signed-in member rather than the IP:
 *   • `userWriteLimiter` — the report wizard's writes (draft autosaves, evidence
 *     presign/commit/remove, filing). One filing is a dozen writes; behind a
 *     carrier-grade NAT a whole neighbourhood shares an IP, and a per-IP bucket
 *     let one person's wizard exhaust everyone else's.
 *   • `flagLimiter` — a per-window *and* a per-day budget of flags. A flag costs a
 *     moderator's attention and can queue an AI re-check, so it is the lever a
 *     brigade pulls (D8); the daily cap bounds a determined account even when
 *     it paces itself under the window limit.
 * Both run after `userAuthGuard`, so `req.user` is set; the IP fallback exists
 * only so a mis-ordered stack still limits rather than throws.
 *
 * ── Per-operator limiter (docs/INCIDENT_MODULE_PLAN.md §8.1, §9.1) ────────
 * `adminWriteLimiter` guards every console write under `/admin/moderation` and
 * `/admin/incidents`, keyed by the operator's admin id. The per-IP
 * `writeLimiter` (30 per window by default) was the old queue's limiter: a
 * moderator working the queue makes one write per decision, and a team behind
 * one office IP shared a single bucket, so it throttled exactly the people
 * clearing the backlog. Keyed per operator, one account's runaway script is
 * bounded without slowing the colleague at the next desk. It reuses the
 * per-account budget `RATE_LIMIT_USER_WRITE_MAX` (120 per window) — the same
 * "one person's writes" allowance members get — and runs after
 * `adminAuthGuard`, so `req.user` is the operator.
 */

import rateLimit, { type Options } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";

/** Shared 429 response, in the legacy error envelope the clients read. */
function limitHandler(name: string) {
  return (req: Request, res: Parameters<Options["handler"]>[1]): void => {
    logger.warn("[rate-limit] request throttled", {
      limiter: name,
      ip: req.ip,
      actor: req.user?.id,
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

/** The bucket for a per-member limiter: the member, or the IP if none is attached. */
function memberKey(req: Request): string {
  return req.user?.id ? `member:${req.user.id}` : `ip:${req.ip ?? "unknown"}`;
}

/**
 * Per-member budget for the report wizard's writes — drafts, evidence and
 * filing (§7.9). See the file header.
 */
export const userWriteLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.userWriteMax,
  keyGenerator: memberKey,
  handler: limitHandler("user-write"),
});

/** The bucket for the per-operator limiter: the admin, or the IP if none is attached. */
function adminKey(req: Request): string {
  return req.user?.id && req.user.audience === "admin" ? `admin:${req.user.id}` : `ip:${req.ip ?? "unknown"}`;
}

/**
 * Per-operator budget for console writes — moderation decisions, keyword
 * rules, bans, incident decisions, assignment and notes. See the file header.
 */
export const adminWriteLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.userWriteMax,
  keyGenerator: adminKey,
  handler: limitHandler("admin-write"),
});

const DAY_MS = 24 * 60 * 60 * 1000;

const flagWindowLimiter = rateLimit({
  ...shared,
  max: env.rateLimit.flagMax,
  keyGenerator: memberKey,
  handler: limitHandler("flag"),
});

const flagDailyLimiter = rateLimit({
  ...shared,
  windowMs: DAY_MS,
  max: env.rateLimit.flagDailyMax,
  keyGenerator: memberKey,
  handler: limitHandler("flag-daily"),
});

/**
 * Per-member flag budget (§7.6): `RATE_LIMIT_FLAG_MAX` per window and
 * `RATE_LIMIT_FLAG_DAILY_MAX` per 24 hours. Mount it as-is; Express runs the two
 * in order.
 */
export const flagLimiter: RequestHandler[] = [flagWindowLimiter, flagDailyLimiter];

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
