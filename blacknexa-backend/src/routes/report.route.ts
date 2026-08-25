/**
 * Report routes — `/api/v1/reports`, `/api/v1/comments`, `/api/v1/notifications`.
 *
 * ── Everything here requires an account ────────────────────────────────────
 * The geo-legal module deliberately left its write routes open, on the reasoning
 * that "a reporter documenting an incident must not be blocked by a sign-in wall."
 * The design overrides that: every report has an owner (C9 — "Moderators can still
 * see who filed it"), drafts are per-user, D2 exists, and the Vault lists "my
 * reports". Anonymity is a display property, not an authentication mode.
 *
 * ── Route ordering ────────────────────────────────────────────────────────
 * The static paths — `/drafts`, `/facets`, `/search`, `/evidence` — are declared
 * before `/:id`, or `/:id` would swallow them and `GET /reports/search` would look
 * up a report whose reference is the word "search".
 */

import { Router } from "express";
import reportController from "@/controllers/report.controller";
import { validate } from "@/middlewares/validate.middleware";
import { userAuthGuard, optionalAuth } from "@/middlewares/auth.middleware";
import { readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

// ── Drafts (C1–C7, C10, C11) ─────────────────────────────────────────────────

router.post(
  "/drafts",
  userAuthGuard,
  writeLimiter,
  validate("reports.saveDraft"),
  asyncHandler((req, res) => reportController.saveDraft(req, res)),
);

router.get(
  "/drafts",
  userAuthGuard,
  readLimiter,
  asyncHandler((req, res) => reportController.listDrafts(req, res)),
);

router.get(
  "/drafts/:id/evidence",
  userAuthGuard,
  readLimiter,
  validate("reports.draftId"),
  asyncHandler((req, res) => reportController.draftEvidence(req, res)),
);

router.delete(
  "/drafts/:id",
  userAuthGuard,
  writeLimiter,
  validate("reports.draftId"),
  asyncHandler((req, res) => reportController.discardDraft(req, res)),
);

// ── Evidence (C5) ────────────────────────────────────────────────────────────

router.post(
  "/evidence/presign",
  userAuthGuard,
  writeLimiter,
  validate("reports.presignEvidence"),
  asyncHandler((req, res) => reportController.presignEvidence(req, res)),
);

/** Where "Sealed" is established — the server hashes what was actually stored. */
router.post(
  "/evidence/:id/commit",
  userAuthGuard,
  writeLimiter,
  validate("reports.commitEvidence"),
  asyncHandler((req, res) => reportController.commitEvidence(req, res)),
);

router.delete(
  "/evidence/:id",
  userAuthGuard,
  writeLimiter,
  validate("reports.evidenceId"),
  asyncHandler((req, res) => reportController.removeEvidence(req, res)),
);

// ── Feed (B1–B7) ─────────────────────────────────────────────────────────────

/**
 * `optionalAuth` rather than a hard guard on the reads.
 *
 * A signed-in caller gets richer rows — whether they have already stood with each
 * report, and their hidden-from-feed list applied. An anonymous caller still gets
 * the public feed, which is what the share links resolve into.
 */
router.get(
  "/facets",
  optionalAuth,
  readLimiter,
  validate("reports.feed"),
  asyncHandler((req, res) => reportController.facets(req, res)),
);

router.get(
  "/search",
  optionalAuth,
  readLimiter,
  validate("reports.search"),
  asyncHandler((req, res) => reportController.search(req, res)),
);

// ── Filing (C7) ──────────────────────────────────────────────────────────────

router.post(
  "/",
  userAuthGuard,
  writeLimiter,
  validate("reports.file"),
  asyncHandler((req, res) => reportController.file(req, res)),
);

router.get(
  "/",
  optionalAuth,
  readLimiter,
  validate("reports.feed"),
  asyncHandler((req, res) => reportController.feed(req, res)),
);

// ── Detail and its sub-resources (D1–D10) ────────────────────────────────────

router.get(
  "/:id/trust",
  optionalAuth,
  readLimiter,
  validate("reports.byId"),
  asyncHandler((req, res) => reportController.trust(req, res)),
);

router.get(
  "/:id/comments",
  optionalAuth,
  readLimiter,
  validate("reports.comments"),
  asyncHandler((req, res) => reportController.comments(req, res)),
);

router.post(
  "/:id/comments",
  userAuthGuard,
  writeLimiter,
  validate("reports.createComment"),
  asyncHandler((req, res) => reportController.createComment(req, res)),
);

router.post(
  "/:id/support",
  userAuthGuard,
  writeLimiter,
  validate("reports.byId"),
  asyncHandler((req, res) => reportController.support(req, res)),
);

router.post(
  "/:id/corroborate",
  userAuthGuard,
  writeLimiter,
  validate("reports.corroborate"),
  asyncHandler((req, res) => reportController.corroborate(req, res)),
);

router.post(
  "/:id/flags",
  userAuthGuard,
  writeLimiter,
  validate("reports.flag"),
  asyncHandler((req, res) => reportController.flag(req, res)),
);

router.post(
  "/:id/hide",
  userAuthGuard,
  writeLimiter,
  validate("reports.byId"),
  asyncHandler((req, res) => reportController.hide(req, res)),
);

router.post(
  "/:id/share-link",
  userAuthGuard,
  writeLimiter,
  validate("reports.byId"),
  asyncHandler((req, res) => reportController.shareLink(req, res)),
);

router.get(
  "/:id",
  optionalAuth,
  readLimiter,
  validate("reports.byId"),
  asyncHandler((req, res) => reportController.detail(req, res)),
);

router.patch(
  "/:id",
  userAuthGuard,
  writeLimiter,
  validate("reports.update"),
  asyncHandler((req, res) => reportController.update(req, res)),
);

router.delete(
  "/:id",
  userAuthGuard,
  writeLimiter,
  validate("reports.byId"),
  asyncHandler((req, res) => reportController.remove(req, res)),
);

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// `/api/v1/comments` — actions on a comment rather than on its report
// ─────────────────────────────────────────────────────────────────────────────

export const commentRouter = Router();

commentRouter.post(
  "/:id/like",
  userAuthGuard,
  writeLimiter,
  validate("comments.byId"),
  asyncHandler((req, res) => reportController.likeComment(req, res)),
);

commentRouter.post(
  "/:id/flags",
  userAuthGuard,
  writeLimiter,
  validate("comments.flag"),
  asyncHandler((req, res) => reportController.flagComment(req, res)),
);

commentRouter.delete(
  "/:id",
  userAuthGuard,
  writeLimiter,
  validate("comments.byId"),
  asyncHandler((req, res) => reportController.removeComment(req, res)),
);

// ─────────────────────────────────────────────────────────────────────────────
// `/api/v1/notifications` — screen B3
// ─────────────────────────────────────────────────────────────────────────────

export const notificationRouter = Router();

notificationRouter.get(
  "/",
  userAuthGuard,
  readLimiter,
  validate("notifications.list"),
  asyncHandler((req, res) => reportController.notifications(req, res)),
);

notificationRouter.post(
  "/read-all",
  userAuthGuard,
  writeLimiter,
  asyncHandler((req, res) => reportController.markAllRead(req, res)),
);
