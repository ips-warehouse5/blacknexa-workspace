/**
 * Moderator schemas.
 *
 * The one rule worth stating: `status` accepts only the three outcomes a moderator
 * can set. `draft` and `submitted` are absent because a moderator cannot un-file a
 * report or return it to a draft — those are the owner's states, and the status
 * machine in `report.service.ts` would refuse them anyway. Rejecting them here
 * gives a clear message instead of a state-machine error.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";

const UUID = Joi.string().uuid({ version: "uuidv4" });

export const moderationSchemas: SchemaRegistry = {
  "moderation.queue": {
    query: Joi.object({
      status: Joi.string().valid("submitted", "under_review", "verified", "dismissed"),
      urgent: Joi.boolean(),
      flagged: Joi.boolean(),
      cursor: Joi.string().max(64),
      limit: Joi.number().integer().min(1).max(100).default(25),
    }),
  },

  "moderation.reportId": {
    params: Joi.object({ id: UUID.required() }),
  },

  "moderation.evidence": {
    params: Joi.object({ id: UUID.required(), evidenceId: UUID.required() }),
  },

  "moderation.decide": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      // Only the three a moderator can set — see the file header.
      status: Joi.string()
        .valid("under_review", "verified", "dismissed")
        .required()
        .messages({
          "any.only": "A moderator can only mark a report reviewing, verified or dismissed.",
        }),
      // Written onto the timeline the owner reads, so it is bounded and optional.
      note: Joi.string().trim().max(512).allow("").optional(),
    }),
  },

  "moderation.resolveFlag": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      outcome: Joi.string().valid("resolved", "dismissed").required(),
      // Emailed to the person who flagged, so it must say something.
      resolution: Joi.string().trim().min(1).max(512).required().messages({
        "string.empty": "Say what was done — this is emailed to the person who flagged it.",
      }),
    }),
  },

  "moderation.commentId": {
    params: Joi.object({ id: UUID.required() }),
  },

  "moderation.broadcast": {
    body: Joi.object({
      /*
       * A geohash prefix. Required and non-empty: A11 promises urgent notices are
       * "for your area only", and a broadcast with no area would reach everyone —
       * breaking the same promise it is sent under.
       */
      area: Joi.string()
        .trim()
        .pattern(/^[0-9bcdefghjkmnpqrstuvwxyz]{2,8}$/)
        .required()
        .messages({
          "string.pattern.base": "Area must be a geohash prefix of 2 to 8 characters.",
          "any.required": "An urgent broadcast must name an area.",
        }),
      title: Joi.string().trim().min(1).max(120).required(),
      body: Joi.string().trim().min(1).max(400).required(),
    }),
  },
};

export default moderationSchemas;
