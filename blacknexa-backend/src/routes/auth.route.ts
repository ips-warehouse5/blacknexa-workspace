/**
 * End-user authentication routes — `/api/v1/auth` and `/api/v1/users/me`.
 *
 * Two limiter choices worth stating:
 *
 *   • `authLimiter` guards every path that accepts a code or a password. It is
 *     keyed by IP **and** submitted email, so one attacker cannot exhaust a whole
 *     NAT range's budget, and cannot rotate addresses to get more attempts
 *     against one account either.
 *
 *   • `/resend-code` and `/password/forgot` are limited *and* subject to the
 *     per-code cooldown in the service. The limiter stops abuse; the cooldown is
 *     what makes the A8 / A14 countdown honest rather than decorative.
 *
 * `/refresh` sits behind `authLimiter` too. It takes no password, but it is the
 * one unauthenticated endpoint that mints access tokens, so it deserves the same
 * treatment as login.
 */

import { Router } from "express";
import userAuthController from "@/controllers/user_auth.controller";
import { validate } from "@/middlewares/validate.middleware";
import { userAuthGuard } from "@/middlewares/auth.middleware";
import { authLimiter, readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

// ── Account creation and verification (A6 → A8) ──────────────────────────────

router.post(
  "/register",
  authLimiter,
  validate("userAuth.register"),
  asyncHandler((req, res) => userAuthController.register(req, res)),
);

router.post(
  "/verify-email",
  authLimiter,
  validate("userAuth.verifyEmail"),
  asyncHandler((req, res) => userAuthController.verifyEmail(req, res)),
);

router.post(
  "/resend-code",
  authLimiter,
  validate("userAuth.resendCode"),
  asyncHandler((req, res) => userAuthController.resendCode(req, res)),
);

// ── Sign in (A5, A10) ────────────────────────────────────────────────────────

router.post(
  "/login",
  authLimiter,
  validate("userAuth.login"),
  asyncHandler((req, res) => userAuthController.login(req, res)),
);

/**
 * Native Apple / Google sign-in.
 *
 * The provider is in the path so the route is self-documenting and so the
 * validation can reject an unknown provider before the body is examined.
 */
router.post(
  "/oauth/:provider",
  authLimiter,
  validate("userAuth.socialLogin"),
  asyncHandler((req, res) => {
    // The path is authoritative; the body copy is optional and ignored if absent.
    req.body.provider = req.params.provider;
    return userAuthController.socialLogin(req, res);
  }),
);

// ── Session lifecycle ────────────────────────────────────────────────────────

router.post(
  "/refresh",
  authLimiter,
  validate("userAuth.refresh"),
  asyncHandler((req, res) => userAuthController.refresh(req, res)),
);

router.post(
  "/logout",
  userAuthGuard,
  asyncHandler((req, res) => userAuthController.logout(req, res)),
);

/** Screen A15's side effect, offered directly from Profile → Security. */
router.post(
  "/logout-all",
  userAuthGuard,
  asyncHandler((req, res) => userAuthController.logoutAll(req, res)),
);

// ── Password reset (A13 → A15) ───────────────────────────────────────────────

router.post(
  "/password/forgot",
  authLimiter,
  validate("userAuth.forgotPassword"),
  asyncHandler((req, res) => userAuthController.forgotPassword(req, res)),
);

router.post(
  "/password/reset",
  authLimiter,
  validate("userAuth.resetPassword"),
  asyncHandler((req, res) => userAuthController.resetPassword(req, res)),
);

// ── Identity ─────────────────────────────────────────────────────────────────

router.get(
  "/me",
  userAuthGuard,
  readLimiter,
  asyncHandler((req, res) => userAuthController.me(req, res)),
);

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// `/api/v1/users/me` — profile and device management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mounted separately because these are resources on the member, not steps in an
 * authentication flow — keeping them apart stops `/auth` from becoming a
 * catch-all for anything user-shaped.
 */
export const userRouter = Router();

userRouter.patch(
  "/me",
  userAuthGuard,
  writeLimiter,
  validate("userAuth.updateProfile"),
  asyncHandler((req, res) => userAuthController.updateProfile(req, res)),
);

userRouter.get(
  "/me/sessions",
  userAuthGuard,
  readLimiter,
  asyncHandler((req, res) => userAuthController.listSessions(req, res)),
);

userRouter.post(
  "/me/consents",
  userAuthGuard,
  writeLimiter,
  validate("userAuth.recordConsents"),
  asyncHandler((req, res) => userAuthController.recordConsents(req, res)),
);

userRouter.post(
  "/me/devices",
  userAuthGuard,
  writeLimiter,
  validate("userAuth.registerDevice"),
  asyncHandler((req, res) => userAuthController.registerDevice(req, res)),
);

/**
 * The one irreversible endpoint in the app.
 *
 * On `writeLimiter` rather than a stricter tier because the re-authentication step
 * inside is the real gate — and someone who has just failed a password confirmation
 * on their own account should not then be locked out of retrying it.
 */
userRouter.delete(
  "/me",
  userAuthGuard,
  writeLimiter,
  validate("userAuth.deleteAccount"),
  asyncHandler((req, res) => userAuthController.deleteAccount(req, res)),
);

/** For Apple- and Google-only accounts, which have no password to re-type. */
userRouter.post(
  "/me/deletion-code",
  userAuthGuard,
  authLimiter,
  asyncHandler((req, res) => userAuthController.requestDeletionCode(req, res)),
);

