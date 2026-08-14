/**
 * Enterprise Core Engine routes — `/api/v1/blacknexa`.
 *
 * `GET /live-chat` is not declared here: it is a WebSocket upgrade, handled by the
 * `ws` server attached to the same HTTP server in `websocket/live_chat.ts`. An
 * Express route would never see the upgrade request. A plain GET to that path
 * falls through to the 404 handler, matching the Worker's 426 intent closely
 * enough that no client behaviour changes — `LiveChatSheet.tsx` only ever opens a
 * WebSocket.
 */

import { Router } from "express";
import enterpriseController from "@/controllers/enterprise.controller";
import { validate } from "@/middlewares/validate.middleware";
import { readLimiter, writeLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

const router = Router();

router.get(
  "/categories",
  readLimiter,
  asyncHandler((req, res) => enterpriseController.categories(req, res)),
);

router.get(
  "/feed",
  readLimiter,
  validate("enterprise.feed"),
  asyncHandler((req, res) => enterpriseController.feed(req, res)),
);

router.get(
  "/stats",
  readLimiter,
  asyncHandler((req, res) => enterpriseController.stats(req, res)),
);

/** Runs a web search plus synthesis — gateway spend per call. */
router.post(
  "/generate-story",
  writeLimiter,
  validate("enterprise.generateStory"),
  asyncHandler((req, res) => enterpriseController.generateStory(req, res)),
);

router.post(
  "/publish-verified-story",
  writeLimiter,
  validate("enterprise.publishVerifiedStory"),
  asyncHandler((req, res) => enterpriseController.publishVerifiedStory(req, res)),
);

/**
 * Accepts the payload in the query string as well as the body, because
 * `ArtistTippingSheet.tsx` posts snake_case query parameters with an empty body.
 */
router.post(
  "/artists/tip",
  writeLimiter,
  validate("enterprise.artistTip"),
  asyncHandler((req, res) => enterpriseController.artistTip(req, res)),
);

/**
 * The in-app panic button and hardware beacons both land here with snake_case
 * bodies. Kept on the write limiter rather than a tighter one: a genuine emergency
 * may involve repeated presses, and throttling a safety signal would be the wrong
 * trade.
 */
router.post(
  "/hardware/beacon-trigger",
  writeLimiter,
  validate("enterprise.beaconTrigger"),
  asyncHandler((req, res) => enterpriseController.beaconTrigger(req, res)),
);

router.get(
  "/weather",
  readLimiter,
  validate("enterprise.weather"),
  asyncHandler((req, res) => enterpriseController.weather(req, res)),
);

export default router;
