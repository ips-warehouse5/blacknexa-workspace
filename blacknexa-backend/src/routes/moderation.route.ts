/**
 * Content Moderation routes — `/api/v1/admin/moderation`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §8.1; the full contract is
 * `docs/ADMIN_MODERATION_API.md`. The house pattern of the newer admin modules
 * (contact, FAQs, staff): one `router.use(adminAuthGuard)`, then on each route
 * the ability it needs — `requirePermission("moderation.*")`, never a list of
 * role names — then its schema, then the handler. Writes also pass the
 * per-operator `adminWriteLimiter`, keyed by admin id rather than IP.
 *
 *   moderation.view      — the queue, its counts, a case, its files, stats,
 *                          reading keyword rules
 *   moderation.decide    — approve, reject, hide a file, re-run the AI
 *   moderation.ban       — ban / unban a member
 *   moderation.keywords  — create, change and delete keyword rules
 *   platform.operate     — broadcast and maintenance (superadmin only, as before)
 *
 * Removed with revision 2: the server-rendered HTML queue, `/reports*` (the
 * queue now lists moderation *cases*, reports and comments alike),
 * `/flags/:id/resolve` (a decision resolves every flag on its target) and
 * `/comments/:id/hide` (a comment is removed by rejecting its case).
 *
 * Static paths (`/cases/summary`) are declared before their `/:id` siblings, or
 * Express would match "summary" as an id and the UUID schema would answer 400
 * for a route that exists.
 */

import { Router } from "express";
import moderationController from "@/controllers/moderation.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, requirePermission } from "@/middlewares/auth.middleware";
import { adminWriteLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

router.use(adminAuthGuard);

// ── Queue ────────────────────────────────────────────────────────────────────

router.get(
  "/cases",
  requirePermission("moderation.view"),
  validate("moderation.caseList"),
  asyncHandler((req, res) => moderationController.listCases(req, res)),
);

router.get(
  "/cases/summary",
  requirePermission("moderation.view"),
  validate("moderation.caseSummary"),
  asyncHandler((req, res) => moderationController.caseSummary(req, res)),
);

router.get(
  "/cases/:id",
  requirePermission("moderation.view"),
  validate("moderation.caseId"),
  asyncHandler((req, res) => moderationController.caseDetail(req, res)),
);

router.get(
  "/cases/:id/evidence/:evidenceId",
  requirePermission("moderation.view"),
  validate("moderation.caseEvidence"),
  asyncHandler((req, res) => moderationController.caseEvidence(req, res)),
);

// ── Decisions ────────────────────────────────────────────────────────────────

router.post(
  "/cases/:id/approve",
  requirePermission("moderation.decide"),
  adminWriteLimiter,
  validate("moderation.approve"),
  asyncHandler((req, res) => moderationController.approve(req, res)),
);

router.post(
  "/cases/:id/reject",
  requirePermission("moderation.decide"),
  adminWriteLimiter,
  validate("moderation.reject"),
  asyncHandler((req, res) => moderationController.reject(req, res)),
);

router.post(
  "/cases/:id/evidence/:evidenceId/reject",
  requirePermission("moderation.decide"),
  adminWriteLimiter,
  validate("moderation.evidenceReject"),
  asyncHandler((req, res) => moderationController.rejectEvidence(req, res)),
);

router.post(
  "/cases/:id/rerun",
  requirePermission("moderation.decide"),
  adminWriteLimiter,
  validate("moderation.caseId"),
  asyncHandler((req, res) => moderationController.rerun(req, res)),
);

// ── Member enforcement ───────────────────────────────────────────────────────

router.post(
  "/members/:id/ban",
  requirePermission("moderation.ban"),
  adminWriteLimiter,
  validate("moderation.ban"),
  asyncHandler((req, res) => moderationController.ban(req, res)),
);

router.post(
  "/members/:id/unban",
  requirePermission("moderation.ban"),
  adminWriteLimiter,
  validate("moderation.unban"),
  asyncHandler((req, res) => moderationController.unban(req, res)),
);

// ── Keyword rules ────────────────────────────────────────────────────────────

router.get(
  "/keyword-rules",
  requirePermission("moderation.view"),
  validate("moderation.ruleList"),
  asyncHandler((req, res) => moderationController.listRules(req, res)),
);

router.get(
  "/keyword-rules/:id",
  requirePermission("moderation.view"),
  validate("moderation.ruleId"),
  asyncHandler((req, res) => moderationController.getRule(req, res)),
);

router.post(
  "/keyword-rules",
  requirePermission("moderation.keywords"),
  adminWriteLimiter,
  validate("moderation.ruleCreate"),
  asyncHandler((req, res) => moderationController.createRule(req, res)),
);

router.patch(
  "/keyword-rules/:id",
  requirePermission("moderation.keywords"),
  adminWriteLimiter,
  validate("moderation.ruleUpdate"),
  asyncHandler((req, res) => moderationController.updateRule(req, res)),
);

router.delete(
  "/keyword-rules/:id",
  requirePermission("moderation.keywords"),
  adminWriteLimiter,
  validate("moderation.ruleId"),
  asyncHandler((req, res) => moderationController.deleteRule(req, res)),
);

// ── Stats ────────────────────────────────────────────────────────────────────

router.get(
  "/stats",
  requirePermission("moderation.view"),
  validate("moderation.stats"),
  asyncHandler((req, res) => moderationController.stats(req, res)),
);

// ── Operations (superadmin) ──────────────────────────────────────────────────

/**
 * An urgent area broadcast — A11's fourth notification type. It reaches every
 * member in an area regardless of their notification preference, which is a
 * power a queue moderator does not need.
 */
router.post(
  "/broadcast",
  requirePermission("platform.operate"),
  adminWriteLimiter,
  validate("moderation.broadcast"),
  asyncHandler((req, res) => moderationController.broadcast(req, res)),
);

/**
 * Run the nightly maintenance job now. It deletes files, which is not a button a
 * queue moderator needs — and the cron does the same work unattended anyway.
 */
router.post(
  "/maintenance",
  requirePermission("platform.operate"),
  adminWriteLimiter,
  validate("moderation.maintenance"),
  asyncHandler((req, res) => moderationController.runMaintenance(req, res)),
);

export default router;
