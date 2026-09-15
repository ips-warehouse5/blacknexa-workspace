/**
 * Contact-us routes.
 *
 * Two routers, because the two halves have nothing in common but a table:
 *
 *   • the default export is the **public** submission endpoint, mounted at
 *     `/api/v1/contact`. The marketing site's Next.js route handler forwards to
 *     it server-side, so no browser calls it directly and it needs no CORS
 *     entry;
 *   • `adminContactRouter` is the console's queue, mounted at
 *     `/api/v1/admin/contact` behind the operator guard.
 *
 * The public route carries `writeLimiter` rather than the read tier. It is the
 * only unauthenticated write in the API, it inserts a row on every call, and
 * there is no account to lock out after a burst — the rate limit is the whole
 * defence against someone deciding to fill the table.
 */

import { Router } from "express";

import contactController from "@/controllers/contact.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, requirePermission } from "@/middlewares/auth.middleware";
import { writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

/** `POST /api/v1/contact` — public submission from the website form. */
router.post(
  "/",
  writeLimiter,
  validate("contact.submit"),
  asyncHandler((req, res) => contactController.submit(req, res)),
);

export default router;

// ── Console queue ───────────────────────────────────────────────────────────

/**
 * Mounted separately at `/api/v1/admin/contact`.
 *
 * Each route names the ability it needs rather than a list of roles, so what it
 * protects is readable without cross-referencing the role model.
 */
export const adminContactRouter = Router();

adminContactRouter.use(adminAuthGuard);

adminContactRouter.get(
  "/",
  requirePermission("contact.view"),
  validate("contact.list"),
  asyncHandler((req, res) => contactController.list(req, res)),
);

/*
 * Before `/:id`, or Express matches "summary" as an id — and the UUID param
 * schema would then answer 400 for a route that exists.
 */
adminContactRouter.get(
  "/summary",
  requirePermission("contact.view"),
  asyncHandler((req, res) => contactController.summary(req, res)),
);

adminContactRouter.get(
  "/:id",
  requirePermission("contact.view"),
  validate("contact.id"),
  asyncHandler((req, res) => contactController.detail(req, res)),
);

adminContactRouter.patch(
  "/:id",
  requirePermission("contact.manage"),
  validate("contact.update"),
  asyncHandler((req, res) => contactController.update(req, res)),
);

adminContactRouter.delete(
  "/:id",
  requirePermission("contact.delete"),
  validate("contact.id"),
  asyncHandler((req, res) => contactController.remove(req, res)),
);
