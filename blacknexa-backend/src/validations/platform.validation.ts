/**
 * Platform request schemas — tipping, payouts, moderation, ToS, ops.
 *
 * The mass-assignment risk is concentrated here, so the money schemas are
 * deliberately narrow. `stripUnknown` plus these definitions mean a caller cannot
 * post `verified: true` into a creator registration, `status: "succeeded"` into a
 * tip, or `amountUsd` into a payout request — every one of those is decided
 * server-side.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { SUPPORTED_TIP_CURRENCIES } from "@/config/constants";
import { ALL_PLATFORM_CATEGORIES } from "@/services/platform_news.service";

/** An entity id used in a path segment. */
const idParam = Joi.string().trim().min(1).max(255).required();

export const platformSchemas: SchemaRegistry = {
  // ── News facade ────────────────────────────────────────────────────────────

  "platform.newsFeed": {
    query: Joi.object({
      category: Joi.string()
        .valid(...ALL_PLATFORM_CATEGORIES)
        .optional(),
      locale: Joi.string().trim().max(16).default("en"),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },

  // ── Creators ───────────────────────────────────────────────────────────────

  "platform.creatorRegister": {
    body: Joi.object({
      userId: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "userId, displayName, and handle are required",
        "string.empty": "userId, displayName, and handle are required",
      }),
      displayName: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "userId, displayName, and handle are required",
        "string.empty": "userId, displayName, and handle are required",
      }),
      handle: Joi.string()
        .trim()
        .min(1)
        .max(64)
        // Handles are shown publicly and used for lookup — keep them URL-safe.
        .pattern(/^[a-zA-Z0-9._-]+$/)
        .required()
        .messages({
          "any.required": "userId, displayName, and handle are required",
          "string.empty": "userId, displayName, and handle are required",
          "string.pattern.base":
            "handle may contain only letters, numbers, dots, underscores and hyphens",
        }),
      bio: Joi.string().trim().max(2000).allow("").default(""),
      defaultCurrency: Joi.string()
        .trim()
        .uppercase()
        .valid(...SUPPORTED_TIP_CURRENCIES)
        .default("USD"),
      stripeAccountId: Joi.string().trim().max(255).allow("").optional(),
      // `verified` is intentionally absent: verification is a moderation decision,
      // never something a registration request can grant itself.
    }),
  },

  "platform.creatorById": {
    params: Joi.object({ id: idParam }),
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(200).optional(),
    }),
  },

  "platform.creatorList": {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },

  "platform.senderTips": {
    params: Joi.object({ userId: idParam }),
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(200).default(50),
    }),
  },

  // ── Tips ───────────────────────────────────────────────────────────────────

  "platform.sendTip": {
    body: Joi.object({
      senderUserId: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "senderUserId, creatorId, amount, and currency are required",
      }),
      creatorId: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "senderUserId, creatorId, amount, and currency are required",
      }),
      // Minor units in the sender's currency. Bounds are re-checked in USD cents
      // by the service, which is the authoritative limit.
      amount: Joi.number().integer().min(1).max(10_000_000).required().messages({
        "any.required": "senderUserId, creatorId, amount, and currency are required",
      }),
      currency: Joi.string()
        .trim()
        .uppercase()
        .valid(...SUPPORTED_TIP_CURRENCIES)
        .required()
        .messages({
          "any.required": "senderUserId, creatorId, amount, and currency are required",
        }),
      message: Joi.string().trim().max(500).allow("").optional(),
      isSeedDrop: Joi.boolean().default(false),
      // `idempotencyKey` comes from the header, not the body.
    }),
  },

  "platform.tipById": {
    params: Joi.object({ id: idParam }),
  },

  "platform.stripeWebhook": {
    body: Joi.object({
      id: Joi.string().trim().max(255).required(),
      type: Joi.string().trim().max(128).required(),
      data: Joi.object({
        object: Joi.object({
          id: Joi.string().trim().max(255).required(),
          amount: Joi.number().optional(),
          currency: Joi.string().trim().max(8).optional(),
          status: Joi.string().trim().max(64).optional(),
          metadata: Joi.object().pattern(Joi.string(), Joi.string().allow("")).optional(),
          transfer_data: Joi.object({
            destination: Joi.string().allow("").optional(),
            amount: Joi.number().optional(),
          }).optional(),
        })
          .unknown(true)
          .required(),
      })
        .unknown(true)
        .required(),
    }).unknown(true), // Stripe adds fields over time; extra keys must not 400.
  },

  // ── Payouts ────────────────────────────────────────────────────────────────

  "platform.payoutRequest": {
    body: Joi.object({
      creatorId: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "creatorId is required",
        "string.empty": "creatorId is required",
      }),
      destination: Joi.string().valid("stripe", "bank", "paypal").default("stripe"),
      // No `amountUsd`: a payout always withdraws the full available balance, as
      // computed server-side from succeeded tips minus in-flight payouts.
    }),
  },

  "platform.payoutById": {
    params: Joi.object({ id: idParam }),
  },

  "platform.payoutStatus": {
    params: Joi.object({ id: idParam }),
    body: Joi.object({
      status: Joi.string()
        .valid("requested", "processing", "succeeded", "failed")
        .required()
        .messages({ "any.required": "status is required" }),
      providerTransferId: Joi.string().trim().max(255).allow("").optional(),
      failureReason: Joi.string().trim().max(1000).allow("").optional(),
    }),
  },

  // ── Compliance ─────────────────────────────────────────────────────────────

  "platform.moderationCheck": {
    body: Joi.object({
      text: Joi.string().max(50_000).required().messages({
        "any.required": "text is required",
        "string.empty": "text is required",
      }),
    }),
  },

  "platform.tosAgree": {
    body: Joi.object({
      userId: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "userId is required",
        "string.empty": "userId is required",
      }),
    }),
  },

  "platform.tosCheck": {
    query: Joi.object({
      userId: Joi.string().trim().min(1).max(255).required().messages({
        "any.required": "userId is required",
        "string.empty": "userId is required",
      }),
    }),
  },

  // ── Ops ────────────────────────────────────────────────────────────────────

  "platform.queueDrain": {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(5),
    }),
  },

  "platform.queuePrune": {
    query: Joi.object({
      days: Joi.number().integer().min(1).max(365).default(7),
    }),
  },

  "platform.snapshotList": {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },

  "platform.persistenceRestore": {
    // A restore body is a full snapshot: dynamic table keys, so the shape is only
    // loosely constrained here. `persistence.service.ts` re-validates every table
    // name against a frozen allowlist and every column against an identifier
    // pattern before touching SQL.
    body: Joi.object({
      version: Joi.string().max(128).optional(),
      timestamp: Joi.string().max(64).optional(),
      tables: Joi.object().pattern(Joi.string(), Joi.array()).optional(),
      counts: Joi.object().pattern(Joi.string(), Joi.number()).optional(),
      checksum: Joi.string().max(64).optional(),
    })
      .unknown(true)
      .optional(),
  },
};

export default platformSchemas;
