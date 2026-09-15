/**
 * Admin console routes — `/api/v1/admin/auth` and `/api/v1/admin/staff`.
 *
 * `authLimiter` is deliberately very tight on every unauthenticated path here
 * (keyed by IP + email, successful attempts not counted). Those endpoints check
 * passwords, verify one-time codes and send email — all three are things worth
 * rate-limiting even before the per-account lockout applies.
 */

import { Router } from "express";

import adminAuthController from "@/controllers/admin_auth.controller";
import adminStaffController from "@/controllers/admin_staff.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, requirePermission } from "@/middlewares/auth.middleware";
import { authLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

// ── Authentication ──────────────────────────────────────────────────────────

/** First factor. Returns a challenge; never a session. */
router.post(
  "/login",
  authLimiter,
  validate("admin.login"),
  asyncHandler((req, res) => adminAuthController.login(req, res)),
);

/** Second factor. The only route that issues an operator session. */
router.post(
  "/mfa/verify",
  authLimiter,
  validate("admin.mfaVerify"),
  asyncHandler((req, res) => adminAuthController.verifyMfa(req, res)),
);

router.post(
  "/mfa/resend",
  authLimiter,
  validate("admin.mfaResend"),
  asyncHandler((req, res) => adminAuthController.resendMfa(req, res)),
);

router.post(
  "/refresh",
  authLimiter,
  validate("admin.refresh"),
  asyncHandler((req, res) => adminAuthController.refresh(req, res)),
);

router.post(
  "/logout",
  adminAuthGuard,
  asyncHandler((req, res) => adminAuthController.logout(req, res)),
);

router.get(
  "/me",
  adminAuthGuard,
  asyncHandler((req, res) => adminAuthController.me(req, res)),
);

// ── Password recovery ───────────────────────────────────────────────────────

router.post(
  "/password/forgot",
  authLimiter,
  validate("admin.forgotPassword"),
  asyncHandler((req, res) => adminAuthController.forgotPassword(req, res)),
);

router.post(
  "/password/reset",
  authLimiter,
  validate("admin.resetPassword"),
  asyncHandler((req, res) => adminAuthController.resetPassword(req, res)),
);

export default router;

// ── Staff directory ─────────────────────────────────────────────────────────

/**
 * Mounted separately at `/api/v1/admin/staff`.
 *
 * Every route states the ability it needs rather than a list of role names, so
 * what a route protects is readable without cross-referencing the role model.
 */
export const staffRouter = Router();

staffRouter.use(adminAuthGuard);

staffRouter.get(
  "/",
  requirePermission("staff.view"),
  validate("admin.staffList"),
  asyncHandler((req, res) => adminStaffController.list(req, res)),
);

staffRouter.get(
  "/summary",
  requirePermission("staff.view"),
  asyncHandler((req, res) => adminStaffController.summary(req, res)),
);

staffRouter.post(
  "/",
  requirePermission("staff.create"),
  validate("admin.staffCreate"),
  asyncHandler((req, res) => adminStaffController.create(req, res)),
);

staffRouter.patch(
  "/:id",
  requirePermission("staff.edit"),
  validate("admin.staffUpdate"),
  asyncHandler((req, res) => adminStaffController.update(req, res)),
);

staffRouter.patch(
  "/:id/status",
  requirePermission("staff.toggle"),
  validate("admin.staffStatus"),
  asyncHandler((req, res) => adminStaffController.setStatus(req, res)),
);

staffRouter.post(
  "/:id/reset-password",
  requirePermission("staff.reset"),
  validate("admin.staffId"),
  asyncHandler((req, res) => adminStaffController.resetPassword(req, res)),
);

staffRouter.delete(
  "/:id",
  requirePermission("staff.delete"),
  validate("admin.staffId"),
  asyncHandler((req, res) => adminStaffController.remove(req, res)),
);
