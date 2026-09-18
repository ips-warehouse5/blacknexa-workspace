/**
 * Place-search routes — `/api/v1/locations`.
 *
 * Guarded, unlike `/help`. Nothing here is member data, but every call fans out
 * to a third-party geocoder, and an open endpoint that does that is a free proxy
 * for whoever finds it. `readLimiter` on top, because the client searches as the
 * member types.
 */

import { Router } from "express";
import locationController from "@/controllers/location.controller";
import { validate } from "@/middlewares/validate.middleware";
import { userAuthGuard } from "@/middlewares/auth.middleware";
import { readLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

router.get(
  "/search",
  userAuthGuard,
  readLimiter,
  validate("location.search"),
  asyncHandler((req, res) => locationController.search(req, res)),
);

export default router;
