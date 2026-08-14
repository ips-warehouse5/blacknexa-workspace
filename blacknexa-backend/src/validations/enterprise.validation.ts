/**
 * Enterprise Core Engine request schemas.
 *
 * Two of these accept **both** camelCase and snake_case, and one accepts the
 * payload in the query string as well as the body. That is not sloppiness — it is
 * required for compatibility with the already-shipped clients, which disagree with
 * the old Worker:
 *
 *   • `POST /blacknexa/artists/tip` — `ArtistTippingSheet.tsx:65` sends
 *     `artist_id`, `supporter_user_id`, `tip_amount_usd`, `message` as **query
 *     parameters with an empty body**. The Worker called `request.json()` on that
 *     empty body and threw a 500, so this endpoint has never worked from the app.
 *   • `POST /blacknexa/hardware/beacon-trigger` — both `SafetyBeaconButton.tsx:44`
 *     and `SafetyBeaconButton.swift:216` send snake_case JSON (`user_id`,
 *     `device_mac_address`, `trigger_type`, `gps_coordinates`), while the Worker
 *     read camelCase and answered 400.
 *
 * Accepting both spellings fixes the panic button and artist tipping without
 * requiring a mobile release. See `docs/MIGRATION_PLAN.md` §6.2–6.3.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { ENTERPRISE_CATEGORIES } from "@/types/platform.interface";

const ENTERPRISE_CATEGORY_IDS = ENTERPRISE_CATEGORIES.map((c) => String(c));

export const enterpriseSchemas: SchemaRegistry = {
  "enterprise.generateStory": {
    body: Joi.object({
      topic: Joi.string().trim().min(1).max(500).required().messages({
        "any.required": "topic, category, and targetLocation are required.",
        "string.empty": "topic, category, and targetLocation are required.",
      }),
      // Not restricted to the enterprise list here: the service returns the
      // original's specific "Invalid Blacknexa category selected." message, which
      // the clients display.
      category: Joi.string().trim().min(1).max(128).required().messages({
        "any.required": "topic, category, and targetLocation are required.",
      }),
      targetLocation: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "topic, category, and targetLocation are required.",
      }),
      specificIndividualsInvolved: Joi.array()
        .items(Joi.string().trim().max(255))
        .max(50)
        .default([]),
      rawSubstantiatedFacts: Joi.string().trim().max(20_000).allow("").default(""),
      locale: Joi.string().trim().max(16).default("en"),
    }),
  },

  "enterprise.publishVerifiedStory": {
    body: Joi.object({
      topic: Joi.string().trim().min(1).max(500).required().messages({
        "any.required": "topic, category, and targetLocation are required.",
        "string.empty": "topic, category, and targetLocation are required.",
      }),
      category: Joi.string().trim().min(1).max(128).required().messages({
        "any.required": "topic, category, and targetLocation are required.",
      }),
      targetLocation: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "topic, category, and targetLocation are required.",
      }),
      keyIndividuals: Joi.array().items(Joi.string().trim().max(255)).max(50).default([]),
      rawFacts: Joi.string().trim().max(20_000).allow("").default(""),
      // The 3-source floor is enforced in the service so it can return the exact
      // "Truth Guardrail Error" text with a 422, which the app surfaces verbatim.
      verifiedSources: Joi.array().items(Joi.string().trim().uri().max(2048)).default([]),
    }),
  },

  "enterprise.feed": {
    query: Joi.object({
      location: Joi.string().trim().max(255).allow("").optional(),
      category: Joi.string().trim().max(128).allow("").optional(),
    }),
  },

  /**
   * Artist tip. Both the query and the body are optional and both spellings are
   * accepted; the controller merges them and then requires the resolved fields.
   */
  "enterprise.artistTip": {
    query: Joi.object({
      artist_id: Joi.string().trim().max(255).optional(),
      supporter_user_id: Joi.string().trim().max(255).optional(),
      tip_amount_usd: Joi.number().positive().max(100_000).optional(),
      message: Joi.string().trim().max(500).allow("").optional(),
      artistId: Joi.string().trim().max(255).optional(),
      supporterUserId: Joi.string().trim().max(255).optional(),
      tipAmountUsd: Joi.number().positive().max(100_000).optional(),
    }),
    body: Joi.object({
      artist_id: Joi.string().trim().max(255).optional(),
      supporter_user_id: Joi.string().trim().max(255).optional(),
      tip_amount_usd: Joi.number().positive().max(100_000).optional(),
      message: Joi.string().trim().max(500).allow("").optional(),
      artistId: Joi.string().trim().max(255).optional(),
      supporterUserId: Joi.string().trim().max(255).optional(),
      tipAmountUsd: Joi.number().positive().max(100_000).optional(),
    }).default({}),
  },

  /** Beacon trigger. Accepts both casings; the coordinate object is optional. */
  "enterprise.beaconTrigger": {
    body: Joi.object({
      user_id: Joi.string().trim().max(255).optional(),
      device_mac_address: Joi.string().trim().max(128).optional(),
      trigger_type: Joi.string().trim().max(64).optional(),
      gps_coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).default(0),
        lon: Joi.number().min(-180).max(180).default(0),
      }).optional(),
      userId: Joi.string().trim().max(255).optional(),
      deviceMacAddress: Joi.string().trim().max(128).optional(),
      triggerType: Joi.string().trim().max(64).optional(),
      gpsCoordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).default(0),
        lon: Joi.number().min(-180).max(180).default(0),
      }).optional(),
    }),
  },

  "enterprise.weather": {
    query: Joi.object({
      lat: Joi.number().min(-90).max(90).required().messages({
        "any.required": "lat and lon query parameters are required.",
        "number.base": "lat and lon query parameters are required.",
      }),
      lon: Joi.number().min(-180).max(180).required().messages({
        "any.required": "lat and lon query parameters are required.",
        "number.base": "lat and lon query parameters are required.",
      }),
    }),
  },
};

export default enterpriseSchemas;
