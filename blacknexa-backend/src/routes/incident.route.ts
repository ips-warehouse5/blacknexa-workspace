/**
 * Incident Management routes — `/api/v1/admin/incidents`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §9.1; the full contract is
 * `docs/ADMIN_MODERATION_API.md`. Same pattern as the moderation router: one
 * `router.use(adminAuthGuard)`, then `requirePermission("incidents.*")`, the
 * schema and the handler on each route, and the per-operator
 * `adminWriteLimiter` on every write.
 *
 *   incidents.view        — the list, its counts, the dashboard metrics, an incident, its files
 *   incidents.verify      — Mark Verified
 *   incidents.dismiss     — Dismiss, Reopen
 *   incidents.deactivate  — Deactivate, Reactivate (superadmin)
 *   incidents.assign      — Assign / Reassign, and the assignee list (superadmin)
 *   incidents.notes       — Internal Admin Notes
 *
 * The permission says *which* action; the service decides *which incidents*:
 * every `/:id` route goes through `loadIncidentFor`, so an advocate reaches
 * only incidents assigned to them (404 otherwise) and staff see metadata only.
 *
 * Static paths (`/summary`, `/metrics`, `/assignees`) come before `/:id`.
 */

import { Router } from "express";
import incidentController from "@/controllers/incident.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, requirePermission } from "@/middlewares/auth.middleware";
import { adminWriteLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

router.use(adminAuthGuard);

router.get(
  "/",
  requirePermission("incidents.view"),
  validate("incident.list"),
  asyncHandler((req, res) => incidentController.list(req, res)),
);

router.get(
  "/summary",
  requirePermission("incidents.view"),
  validate("incident.summary"),
  asyncHandler((req, res) => incidentController.summary(req, res)),
);

router.get(
  "/metrics",
  requirePermission("incidents.view"),
  validate("incident.metrics"),
  asyncHandler((req, res) => incidentController.metrics(req, res)),
);

router.get(
  "/assignees",
  requirePermission("incidents.assign"),
  validate("incident.assignees"),
  asyncHandler((req, res) => incidentController.assignees(req, res)),
);

router.get(
  "/:id",
  requirePermission("incidents.view"),
  validate("incident.id"),
  asyncHandler((req, res) => incidentController.detail(req, res)),
);

router.get(
  "/:id/evidence/:evidenceId",
  requirePermission("incidents.view"),
  validate("incident.evidence"),
  asyncHandler((req, res) => incidentController.evidence(req, res)),
);

router.post(
  "/:id/verify",
  requirePermission("incidents.verify"),
  adminWriteLimiter,
  validate("incident.verify"),
  asyncHandler((req, res) => incidentController.verify(req, res)),
);

router.post(
  "/:id/dismiss",
  requirePermission("incidents.dismiss"),
  adminWriteLimiter,
  validate("incident.dismiss"),
  asyncHandler((req, res) => incidentController.dismiss(req, res)),
);

router.post(
  "/:id/reopen",
  requirePermission("incidents.dismiss"),
  adminWriteLimiter,
  validate("incident.reopen"),
  asyncHandler((req, res) => incidentController.reopen(req, res)),
);

router.post(
  "/:id/deactivate",
  requirePermission("incidents.deactivate"),
  adminWriteLimiter,
  validate("incident.deactivate"),
  asyncHandler((req, res) => incidentController.deactivate(req, res)),
);

router.post(
  "/:id/reactivate",
  requirePermission("incidents.deactivate"),
  adminWriteLimiter,
  validate("incident.reactivate"),
  asyncHandler((req, res) => incidentController.reactivate(req, res)),
);

router.post(
  "/:id/assign",
  requirePermission("incidents.assign"),
  adminWriteLimiter,
  validate("incident.assign"),
  asyncHandler((req, res) => incidentController.assign(req, res)),
);

router.post(
  "/:id/notes",
  requirePermission("incidents.notes"),
  adminWriteLimiter,
  validate("incident.note"),
  asyncHandler((req, res) => incidentController.addNote(req, res)),
);

export default router;
