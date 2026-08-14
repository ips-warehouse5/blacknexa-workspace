/**
 * Geo-Legal routes — `/api/v1/geo-legal`.
 *
 * The write routes stay unauthenticated because the app calls them with no token,
 * and a reporter documenting an incident must not be blocked by a sign-in wall.
 * They are protected by the write rate limiter, strict Joi validation, and the
 * `humanConfirmed` gate instead.
 *
 * `POST /refresh` is admin-only: it rewrites all 19 cached jurisdiction profiles.
 */

import { Router } from "express";
import geoLegalController from "@/controllers/geo_legal.controller";
import { validate } from "@/middlewares/validate.middleware";
import { adminAuthGuard, checkRole } from "@/middlewares/auth.middleware";
import { readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

/** Static curated region data — no database read, no AI call. */
router.get(
  "/regions",
  readLimiter,
  asyncHandler((req, res) => geoLegalController.regions(req, res)),
);

router.get(
  "/lookup",
  readLimiter,
  validate("geoLegal.lookup"),
  asyncHandler((req, res) => geoLegalController.lookup(req, res)),
);

/** Validation runs an AI call, so it uses the write tier despite being read-only. */
router.post(
  "/validate",
  writeLimiter,
  validate("geoLegal.validate"),
  asyncHandler((req, res) => geoLegalController.validate(req, res)),
);

router.post(
  "/dispatch",
  writeLimiter,
  validate("geoLegal.dispatch"),
  asyncHandler((req, res) => geoLegalController.dispatch(req, res)),
);

router.post(
  "/incident/create",
  writeLimiter,
  validate("geoLegal.createIncident"),
  asyncHandler((req, res) => geoLegalController.createIncident(req, res)),
);

router.get(
  "/incident/:id",
  readLimiter,
  validate("geoLegal.incidentById"),
  asyncHandler((req, res) => geoLegalController.getIncident(req, res)),
);

/** GDPR/CCPA right-to-erasure — a genuine hard delete. */
router.delete(
  "/incident/:id",
  writeLimiter,
  validate("geoLegal.incidentById"),
  asyncHandler((req, res) => geoLegalController.deleteIncident(req, res)),
);

router.post(
  "/refresh",
  adminAuthGuard,
  checkRole(["super-admin", "admin"]),
  asyncHandler((req, res) => geoLegalController.refresh(req, res)),
);

export default router;
