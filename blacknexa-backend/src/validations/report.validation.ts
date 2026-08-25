/**
 * Report module schemas — sections B, C and D.
 *
 * ── Where the limits come from ─────────────────────────────────────────────
 * Every bound here is a number the design prints. C2 shows a `44/70` counter, so
 * the title is capped at 70 and not at a round 100. C3 states that future dates
 * are unselectable, so `occurredAt` is validated against now. These are not
 * arbitrary defensive limits — they are the contract the screens already made with
 * the user, restated where it can be enforced.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import {
  ALL_EVIDENCE_KINDS,
  ALL_FLAG_REASONS,
  ALL_REPORT_CATEGORIES,
} from "@/types/report.interface";
import { ALL_PRECISIONS, ALL_VISIBILITIES } from "@/types/user.interface";

const UUID = Joi.string().uuid({ version: "uuidv4" });

/** An id or a `BNX-####` reference — both resolve the same report. */
const ID_OR_REF = Joi.string()
  .trim()
  .max(64)
  .required()
  .messages({ "any.required": "A report is required." });

/** C2's title: one line, 70 characters, and the counter proves it. */
const TITLE = Joi.string().trim().min(1).max(70).messages({
  "string.max": "Titles are one line — 70 characters at most.",
  "string.empty": "Give the report a title.",
});

/** C3: "Future dates are unselectable." */
const OCCURRED_AT = Joi.string()
  .isoDate()
  .custom((value: string, helpers) => {
    // A minute of slack, so a clock skew between phone and server does not reject
    // a report filed the instant something happened.
    if (Date.parse(value) > Date.now() + 60_000) {
      return helpers.message({ custom: "That is in the future." });
    }
    return value;
  })
  .messages({ "string.isoDate": "That is not a valid date and time." });

/** The wizard's accumulated state. Every field optional — steps fill it in turn. */
const DRAFT_PAYLOAD = Joi.object({
  category: Joi.string().valid(...ALL_REPORT_CATEGORIES),
  title: TITLE,
  body: Joi.string().trim().max(20_000),
  occurredAt: OCCURRED_AT,
  occurredPrecision: Joi.string().valid("exact", "day_part", "unknown"),
  occurredDayPart: Joi.string().valid("morning", "afternoon", "evening", "night"),
  happeningNow: Joi.boolean(),
  locationPrecision: Joi.string().valid(...ALL_PRECISIONS),
  locationLabel: Joi.string().trim().max(160).allow(""),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  visibility: Joi.string().valid(...ALL_VISIBILITIES),
  anonymous: Joi.boolean(),
  urgent: Joi.boolean(),
})
  // `lat` and `lng` are meaningless apart, so neither is accepted alone.
  .and("lat", "lng");

/** Shared feed filters, used by the page, the facets and the search. */
const FEED_QUERY = {
  category: Joi.string().valid(...ALL_REPORT_CATEGORIES),
  when: Joi.string().valid("today", "week", "month", "all"),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  radiusKm: Joi.number().min(0.5).max(500),
  verifiedOnly: Joi.boolean(),
  urgentOnly: Joi.boolean(),
  sort: Joi.string().valid("newest", "supported", "corroborated").default("newest"),
  cursor: Joi.string().max(512),
  limit: Joi.number().integer().min(1).max(50).default(20),
  mine: Joi.boolean(),
};

export const reportSchemas: SchemaRegistry = {
  "reports.saveDraft": {
    body: Joi.object({
      draftId: UUID.optional(),
      step: Joi.number().integer().min(1).max(7).required(),
      payload: DRAFT_PAYLOAD.required(),
    }),
  },

  "reports.draftId": {
    params: Joi.object({ id: UUID.required() }),
  },

  "reports.file": {
    body: Joi.object({
      draftId: UUID.required(),
      // C7's attestation. A literal `true`, so an omitted checkbox cannot pass.
      attested: Joi.boolean().valid(true).required().messages({
        "any.only": "Confirm the report is true to the best of your knowledge.",
        "any.required": "Confirm the report is true to the best of your knowledge.",
      }),
    }),
  },

  "reports.presignEvidence": {
    body: Joi.object({
      kind: Joi.string()
        .valid(...ALL_EVIDENCE_KINDS)
        .required(),
      mime: Joi.string().trim().max(128).required(),
      bytes: Joi.number().integer().min(1).required(),
      durationMs: Joi.number().integer().min(0).optional(),
      capturedAt: Joi.string().isoDate().optional(),
      draftId: UUID.optional(),
      reportId: UUID.optional(),
    })
      // A file belongs to a draft or a report, never to both and never to neither.
      .xor("draftId", "reportId"),
  },

  "reports.commitEvidence": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      // Hex SHA-256, exactly 64 characters — a shorter value is a client bug, not
      // a mismatch, and saying so is more useful than a generic seal failure.
      sha256: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[0-9a-f]{64}$/)
        .required()
        .messages({ "string.pattern.base": "That is not a SHA-256 digest." }),
      capturedAt: Joi.string().isoDate().optional(),
      durationMs: Joi.number().integer().min(0).optional(),
      // Not verified server-side, and it does not need to be: a false `true` costs
      // a broken preview image, never a broken seal. The seal is `sha256`, which
      // covers the original only.
      thumbUploaded: Joi.boolean().optional(),
    }),
  },

  "reports.evidenceId": {
    params: Joi.object({ id: UUID.required() }),
  },

  "reports.feed": {
    query: Joi.object(FEED_QUERY),
  },

  "reports.search": {
    query: Joi.object({
      ...FEED_QUERY,
      q: Joi.string().trim().min(1).max(120).required().messages({
        "any.required": "Type something to search for.",
      }),
    }),
  },

  "reports.byId": {
    params: Joi.object({ id: ID_OR_REF }),
  },

  "reports.update": {
    params: Joi.object({ id: ID_OR_REF }),
    // Title and body only. Evidence is append-only and precision can only narrow,
    // so neither is editable through this route — see the edit policy in the plan.
    body: Joi.object({
      title: TITLE.optional(),
      body: Joi.string().trim().max(20_000).optional(),
    })
      .min(1)
      .messages({ "object.min": "Nothing to change." }),
  },

  "reports.corroborate": {
    params: Joi.object({ id: ID_OR_REF }),
    body: Joi.object({ note: Joi.string().trim().max(1000).allow("").optional() }),
  },

  "reports.flag": {
    params: Joi.object({ id: ID_OR_REF }),
    body: Joi.object({
      // D8: single choice, nothing preselected — so the reason is required.
      reason: Joi.string()
        .valid(...ALL_FLAG_REASONS)
        .required()
        .messages({ "any.required": "Choose a reason." }),
      note: Joi.string().trim().max(1000).allow("").optional(),
    }),
  },

  "reports.comments": {
    params: Joi.object({ id: ID_OR_REF }),
    query: Joi.object({
      sort: Joi.string().valid("top", "new").default("top"),
      cursor: Joi.string().max(64),
    }),
  },

  "reports.createComment": {
    params: Joi.object({ id: ID_OR_REF }),
    body: Joi.object({
      body: Joi.string().trim().min(1).max(4000).required().messages({
        "string.empty": "Write something first.",
      }),
      // Null or a root comment. A third level is refused by the service, which
      // knows whether the parent is itself a reply.
      parentId: UUID.optional(),
      anonymous: Joi.boolean().default(false),
    }),
  },

  "comments.byId": {
    params: Joi.object({ id: UUID.required() }),
  },

  "comments.flag": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      reason: Joi.string()
        .valid(...ALL_FLAG_REASONS)
        .required(),
      note: Joi.string().trim().max(1000).allow("").optional(),
    }),
  },

  "notifications.list": {
    query: Joi.object({
      cursor: Joi.string().max(64),
      limit: Joi.number().integer().min(1).max(50).default(30),
    }),
  },
};

export default reportSchemas;
