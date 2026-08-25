/**
 * Moderator routes — `/api/v1/admin/moderation`.
 *
 * Under `/admin` on purpose: these reuse the operator accounts and tokens that
 * already exist, so the moderator surface adds no new authentication path.
 *
 * `moderator` is listed alongside the operator roles on every route. A moderator is
 * not an admin — they can decide on reports and flags and nothing else, which is
 * why `checkRole` names the permitted set at each route rather than granting
 * super-admin everything implicitly.
 */

import { Router } from "express";
import moderationController from "@/controllers/moderation.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, checkRole } from "@/middlewares/auth.middleware";
import { readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

/** Who may work the queue. */
const MODERATORS = ["super-admin", "admin", "moderator"] as const;

// ── The thin internal page ───────────────────────────────────────────────────

/**
 * `GET /admin/moderation` — HTML.
 *
 * Guarded like everything else, so it cannot be opened without a token; the page
 * itself then calls the JSON API with the same token.
 */
router.get(
  "/",
  adminAuthGuard,
  checkRole([...MODERATORS]),
  readLimiter,
  asyncHandler((req, res) => moderationController.queuePage(req, res)),
);

// ── JSON ─────────────────────────────────────────────────────────────────────

router.get(
  "/stats",
  adminAuthGuard,
  checkRole([...MODERATORS, "auditor"]),
  readLimiter,
  asyncHandler((req, res) => moderationController.stats(req, res)),
);

router.get(
  "/reports",
  adminAuthGuard,
  checkRole([...MODERATORS, "auditor"]),
  readLimiter,
  validate("moderation.queue"),
  asyncHandler((req, res) => moderationController.queue(req, res)),
);

router.get(
  "/reports/:id",
  adminAuthGuard,
  checkRole([...MODERATORS, "auditor"]),
  readLimiter,
  validate("moderation.reportId"),
  asyncHandler((req, res) => moderationController.detail(req, res)),
);

router.get(
  "/reports/:id/evidence/:evidenceId",
  adminAuthGuard,
  checkRole([...MODERATORS]),
  readLimiter,
  validate("moderation.evidence"),
  asyncHandler((req, res) => moderationController.evidenceUrl(req, res)),
);

/** The decision that moves a report's status — and fires the owner's notification. */
router.post(
  "/reports/:id/status",
  adminAuthGuard,
  checkRole([...MODERATORS]),
  writeLimiter,
  validate("moderation.decide"),
  asyncHandler((req, res) => moderationController.decide(req, res)),
);

router.post(
  "/flags/:id/resolve",
  adminAuthGuard,
  checkRole([...MODERATORS]),
  writeLimiter,
  validate("moderation.resolveFlag"),
  asyncHandler((req, res) => moderationController.resolveFlag(req, res)),
);

router.post(
  "/comments/:id/hide",
  adminAuthGuard,
  checkRole([...MODERATORS]),
  writeLimiter,
  validate("moderation.commentId"),
  asyncHandler((req, res) => moderationController.hideComment(req, res)),
);

/**
 * Run the nightly maintenance job now.
 *
 * Super-admin only. It deletes files, which is not a button a queue moderator needs
 * — and the cron does the same work unattended every night anyway.
 */
router.post(
  "/maintenance",
  adminAuthGuard,
  checkRole(["super-admin"]),
  writeLimiter,
  asyncHandler((req, res) => moderationController.runMaintenance(req, res)),
);

/**
 * An urgent area broadcast — A11's fourth notification type.
 *
 * Super-admin and admin only. It reaches every member in an area regardless of
 * their notification preference, which is a power a queue moderator does not need.
 */
router.post(
  "/broadcast",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  writeLimiter,
  validate("moderation.broadcast"),
  asyncHandler((req, res) => moderationController.broadcast(req, res)),
);

export default router;
