/**
 * Admin authentication routes — `/api/v1/admin/auth`.
 *
 * New surface, added because the operational endpoints needed something to guard
 * them. `authLimiter` is deliberately very tight here (8 attempts per window,
 * keyed by IP + email, successful logins not counted) since this is the only
 * password-checking endpoint in the service.
 */

import { Router } from "express";
import adminAuthController from "@/controllers/admin_auth.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, checkRole } from "@/middlewares/auth.middleware";
import { authLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

router.post(
  "/login",
  authLimiter,
  validate("admin.login"),
  asyncHandler((req, res) => adminAuthController.login(req, res)),
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

/** Only a super-admin may mint another operator account. */
router.post(
  "/admins",
  adminAuthGuard,
  checkRole(["super-admin"]),
  validate("admin.create"),
  asyncHandler((req, res) => adminAuthController.createAdmin(req, res)),
);

export default router;
