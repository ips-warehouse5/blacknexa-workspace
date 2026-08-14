/**
 * Platform routes — `/api/v1/platform`.
 *
 * Route ordering note: the tipping paths are declared most-specific first, because
 * `/tipping/creator/:id` would otherwise match `/tipping/creator/register` and
 * `/tipping/creators`. The Worker's regex router was explicit about this; Express
 * needs the ordering to express the same intent.
 *
 * Admin-guarded here: cache prune, queue drain/prune, payout status transitions,
 * and every persistence route. Those mutate shared state or money and were all
 * open in the Worker.
 */

import { Router } from "express";
import platformController from "@/controllers/platform.controller";
import tippingController from "@/controllers/tipping.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, checkRole } from "@/middlewares/auth.middleware";
import {
  readLimiter,
  webhookLimiter,
  writeLimiter,
} from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

// ── Health ───────────────────────────────────────────────────────────────────

router.get(
  "/ping",
  asyncHandler((req, res) => platformController.ping(req, res)),
);

// ── Module 1: Fact-Verified AI News Engine ───────────────────────────────────

router.get(
  "/news/feed",
  readLimiter,
  validate("platform.newsFeed"),
  asyncHandler((req, res) => platformController.newsFeed(req, res)),
);

router.get(
  "/news/categories",
  readLimiter,
  asyncHandler((req, res) => platformController.newsCategories(req, res)),
);

router.get(
  "/news/locales",
  readLimiter,
  asyncHandler((req, res) => platformController.newsLocales(req, res)),
);

// ── Module 2: Tipping & Seed Drop ────────────────────────────────────────────

// Static paths first — see the ordering note above.
router.post(
  "/tipping/creator/register",
  writeLimiter,
  validate("platform.creatorRegister"),
  asyncHandler((req, res) => tippingController.register(req, res)),
);

router.get(
  "/tipping/creators",
  readLimiter,
  validate("platform.creatorList"),
  asyncHandler((req, res) => tippingController.listCreators(req, res)),
);

router.get(
  "/tipping/fees",
  readLimiter,
  asyncHandler((req, res) => tippingController.fees(req, res)),
);

router.post(
  "/tipping/send",
  writeLimiter,
  validate("platform.sendTip"),
  asyncHandler((req, res) => tippingController.sendTip(req, res)),
);

router.post(
  "/tipping/webhook/stripe",
  webhookLimiter,
  validate("platform.stripeWebhook"),
  asyncHandler((req, res) => tippingController.stripeWebhook(req, res)),
);

router.post(
  "/tipping/payout/request",
  writeLimiter,
  validate("platform.payoutRequest"),
  asyncHandler((req, res) => tippingController.requestPayout(req, res)),
);

// Sub-resources of a creator, before the bare `/creator/:id`.
router.get(
  "/tipping/creator/:id/tips",
  readLimiter,
  validate("platform.creatorById"),
  asyncHandler((req, res) => tippingController.creatorTips(req, res)),
);

router.get(
  "/tipping/creator/:id/balance",
  readLimiter,
  validate("platform.creatorById"),
  asyncHandler((req, res) => tippingController.creatorBalance(req, res)),
);

router.get(
  "/tipping/creator/:id/ledger",
  readLimiter,
  validate("platform.creatorById"),
  asyncHandler((req, res) => tippingController.creatorLedger(req, res)),
);

router.get(
  "/tipping/creator/:id/payouts",
  readLimiter,
  validate("platform.creatorById"),
  asyncHandler((req, res) => tippingController.creatorPayouts(req, res)),
);

router.get(
  "/tipping/creator/:id",
  readLimiter,
  validate("platform.creatorById"),
  asyncHandler((req, res) => tippingController.getCreator(req, res)),
);

router.get(
  "/tipping/sender/:userId/tips",
  readLimiter,
  validate("platform.senderTips"),
  asyncHandler((req, res) => tippingController.senderTips(req, res)),
);

router.get(
  "/tipping/tip/:id",
  readLimiter,
  validate("platform.tipById"),
  asyncHandler((req, res) => tippingController.getTip(req, res)),
);

/** Status transitions move money — admin only. */
router.post(
  "/tipping/payout/:id/status",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  validate("platform.payoutStatus"),
  asyncHandler((req, res) => tippingController.updatePayoutStatus(req, res)),
);

router.get(
  "/tipping/payout/:id",
  readLimiter,
  validate("platform.payoutById"),
  asyncHandler((req, res) => tippingController.getPayout(req, res)),
);

// ── Module 3: cache and queue ops ────────────────────────────────────────────

router.get(
  "/cache/stats",
  readLimiter,
  asyncHandler((req, res) => platformController.cacheStats(req, res)),
);

router.post(
  "/cache/prune",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  asyncHandler((req, res) => platformController.cachePrune(req, res)),
);

router.get(
  "/queue/stats",
  readLimiter,
  asyncHandler((req, res) => platformController.queueStats(req, res)),
);

router.post(
  "/queue/drain",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  validate("platform.queueDrain"),
  asyncHandler((req, res) => platformController.queueDrain(req, res)),
);

router.post(
  "/queue/prune",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  validate("platform.queuePrune"),
  asyncHandler((req, res) => platformController.queuePrune(req, res)),
);

// ── Module 4: compliance ─────────────────────────────────────────────────────

router.post(
  "/moderation/check",
  writeLimiter,
  validate("platform.moderationCheck"),
  asyncHandler((req, res) => platformController.moderationCheck(req, res)),
);

router.post(
  "/tos/agree",
  writeLimiter,
  validate("platform.tosAgree"),
  asyncHandler((req, res) => platformController.tosAgree(req, res)),
);

router.get(
  "/tos/check",
  readLimiter,
  validate("platform.tosCheck"),
  asyncHandler((req, res) => platformController.tosCheck(req, res)),
);

router.get(
  "/tos/text",
  readLimiter,
  asyncHandler((req, res) => platformController.tosText(req, res)),
);

router.get(
  "/compliance/disclaimer",
  readLimiter,
  asyncHandler((req, res) => platformController.complianceDisclaimer(req, res)),
);

router.get(
  "/compliance/status",
  readLimiter,
  asyncHandler((req, res) => platformController.complianceStatus(req, res)),
);

// ── Zero-Data-Loss persistence (admin only) ──────────────────────────────────

router.get(
  "/persistence/snapshot",
  adminAuthGuard,
  checkRole(["super-admin", "admin", "auditor"]),
  asyncHandler((req, res) => platformController.snapshot(req, res)),
);

router.post(
  "/persistence/restore",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  validate("platform.persistenceRestore"),
  asyncHandler((req, res) => platformController.restore(req, res)),
);

router.get(
  "/persistence/integrity",
  adminAuthGuard,
  checkRole(["super-admin", "admin", "auditor"]),
  asyncHandler((req, res) => platformController.integrity(req, res)),
);

router.get(
  "/persistence/snapshots",
  adminAuthGuard,
  checkRole(["super-admin", "admin", "auditor"]),
  validate("platform.snapshotList"),
  asyncHandler((req, res) => platformController.listSnapshots(req, res)),
);

export default router;
