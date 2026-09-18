/**
 * FAQ routes.
 *
 * Two routers, because the two halves share a table and nothing else:
 *
 *   • the default export is the **public** read, mounted at `/api/v1/help`. It
 *     is unauthenticated — the Help screen is reachable before sign-in, and the
 *     marketing site renders it for anonymous visitors;
 *   • `adminFaqRouter` is the console's editor, mounted at `/api/v1/admin/faqs`
 *     behind the operator guard, with each route naming the ability it needs.
 */

import { Router } from "express";

import faqController from "@/controllers/faq.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, requirePermission } from "@/middlewares/auth.middleware";
import { readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

/**
 * `GET /api/v1/help/faq` — the app's Help screen and the website's FAQ section.
 *
 * The path is unchanged from when this content was a static module, so the
 * shipped mobile client keeps working without a release; `?surface=website` is
 * the addition.
 */
router.get(
  "/faq",
  readLimiter,
  validate("faq.public"),
  asyncHandler((req, res) => faqController.publicFaq(req, res)),
);

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// `/api/v1/admin/faqs` — the console's editor
// ─────────────────────────────────────────────────────────────────────────────

export const adminFaqRouter = Router();

adminFaqRouter.use(adminAuthGuard);

adminFaqRouter.get(
  "/",
  requirePermission("faq.view"),
  validate("faq.list"),
  asyncHandler((req, res) => faqController.list(req, res)),
);

/*
 * Both literal paths sit before `/:id`, or Express matches "summary" and
 * "categories" as ids — and the UUID param schema would then answer 400 for
 * routes that exist.
 */
adminFaqRouter.get(
  "/summary",
  requirePermission("faq.view"),
  asyncHandler((req, res) => faqController.summary(req, res)),
);

adminFaqRouter.get(
  "/categories",
  requirePermission("faq.view"),
  asyncHandler((req, res) => faqController.categories(req, res)),
);

adminFaqRouter.get(
  "/:id",
  requirePermission("faq.view"),
  validate("faq.id"),
  asyncHandler((req, res) => faqController.detail(req, res)),
);

adminFaqRouter.post(
  "/",
  requirePermission("faq.manage"),
  writeLimiter,
  validate("faq.create"),
  asyncHandler((req, res) => faqController.create(req, res)),
);

adminFaqRouter.patch(
  "/:id",
  requirePermission("faq.manage"),
  writeLimiter,
  validate("faq.update"),
  asyncHandler((req, res) => faqController.update(req, res)),
);

adminFaqRouter.delete(
  "/:id",
  requirePermission("faq.delete"),
  writeLimiter,
  validate("faq.id"),
  asyncHandler((req, res) => faqController.remove(req, res)),
);
