/**
 * News routes — `/api/v1/news`.
 *
 * Route order matters: the static paths (`/feed`, `/local`, `/briefings`) are
 * declared before the parameterised ones so `/api/v1/news/:slug/schema.json`
 * cannot swallow them.
 *
 * The four operational routes are admin-guarded. In the Worker they were open,
 * which meant anyone could trigger a 30-prompt AI batch (real money per call) or
 * delete rows via `prune-duplicates`.
 */

import { Router } from "express";
import newsController from "@/controllers/news.controller";
import mediaController from "@/controllers/media.controller";
import seoController from "@/controllers/seo.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, checkRole } from "@/middlewares/auth.middleware";
import { readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

// ── Public reads ─────────────────────────────────────────────────────────────

router.get(
  "/feed",
  readLimiter,
  validate("news.feed"),
  asyncHandler((req, res) => newsController.feed(req, res)),
);

router.get(
  "/local",
  readLimiter,
  validate("news.local"),
  asyncHandler((req, res) => newsController.localFeed(req, res)),
);

router.get(
  "/briefings",
  readLimiter,
  validate("news.briefings"),
  asyncHandler((req, res) => newsController.briefings(req, res)),
);

router.get(
  "/article/:slug",
  readLimiter,
  validate("news.articleBySlug"),
  asyncHandler((req, res) => newsController.article(req, res)),
);

router.get(
  "/translate/:slug",
  readLimiter,
  validate("news.translate"),
  asyncHandler((req, res) => newsController.translate(req, res)),
);

// ── Media (binary) ───────────────────────────────────────────────────────────

router.get(
  "/image/:articleId",
  readLimiter,
  validate("news.mediaById"),
  asyncHandler((req, res) => mediaController.image(req, res)),
);

// This route was missing from the Worker's router entirely, so every article's
// audioUrl 404'd and the apps fell back to device TTS. See MIGRATION_PLAN §6.1.
router.get(
  "/audio/:articleId",
  readLimiter,
  validate("news.mediaById"),
  asyncHandler((req, res) => mediaController.audio(req, res)),
);

// ── Generation (public write, tightly rate-limited) ──────────────────────────

// Stays unauthenticated because the app calls it with no token, but each call
// costs real gateway spend, so the write limiter applies.
router.post(
  "/generate",
  writeLimiter,
  validate("news.generate"),
  asyncHandler((req, res) => newsController.generate(req, res)),
);

// ── Operational (admin only) ─────────────────────────────────────────────────

router.post(
  "/refresh-daily",
  adminAuthGuard,
  checkRole(["super-admin", "admin", "editor"]),
  validate("news.refreshDaily"),
  asyncHandler((req, res) => newsController.refreshDaily(req, res)),
);

router.post(
  "/prune-duplicates",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  asyncHandler((req, res) => newsController.pruneDuplicates(req, res)),
);

router.post(
  "/backfill-images",
  adminAuthGuard,
  checkRole(["super-admin", "admin", "editor"]),
  validate("news.backfillImages"),
  asyncHandler((req, res) => newsController.backfillImages(req, res)),
);

router.post(
  "/backfill-translations",
  adminAuthGuard,
  checkRole(["super-admin", "admin", "editor"]),
  validate("news.backfillTranslations"),
  asyncHandler((req, res) => newsController.backfillTranslations(req, res)),
);

// ── Syndication for a single article ─────────────────────────────────────────

// Declared last so it cannot shadow `/feed`, `/local`, `/briefings`, etc.
router.get(
  "/:slug/schema.json",
  readLimiter,
  validate("news.schemaJson"),
  asyncHandler((req, res) => seoController.schemaJson(req, res)),
);

export default router;
