/**
 * Content Moderation schemas — `/api/v1/admin/moderation`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §8.1 and §3.3. Every code a request may carry is
 * drawn from the shared vocabulary (`types/moderation.interface.ts`) — tabs,
 * target types, reject and ban reasons, keyword actions — so a value the
 * console offers and a value the API accepts cannot drift apart.
 *
 * ── Rules with teeth ──────────────────────────────────────────────────────
 *   • **`other` needs a note (§3.3).** Choosing "Other" as a reject reason
 *     requires `publicNote` (the author reads the label and the note, so "Other"
 *     alone would tell them nothing); as a ban reason it requires `note`. Empty
 *     and whitespace-only strings count as absent (`.empty("")` after `trim`).
 *     The services re-check with `assertReason`, so no entry point skips it.
 *   • **Lengths are the columns'.** `publicNote` lands in `reports.moderation_note`
 *     and `moderation_cases.resolution_note` (512); internal notes in
 *     `moderation_cases.internal_note` and `audit_events.note` (2000).
 *   • **Lists are page/limit**, like every other console list (contact, staff,
 *     FAQs), so the console's `apiGetPage` gets `result: T[]` and a pagination
 *     block. The old cursor queue is gone with its `/reports` routes.
 *   • **`contentVersion`** is optional on approve/reject: when the console sends
 *     the version it rendered, a report edited in the meantime answers 409
 *     instead of being decided unseen.
 *   • **`evidenceIds`** on approve names the files the moderator was shown;
 *     only those are released (review Q6). Sealing a file does not bump
 *     `contentVersion`, so without the list a photo sealed after the render
 *     was approved at full resolution unseen.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import {
  ALL_KEYWORD_ACTIONS,
  ALL_KEYWORD_APPLIES_TO,
  BAN_REASON_CODES,
  MODERATION_QUEUE_TABS,
  POLICY_CATEGORIES,
  REJECT_REASON_CODES,
} from "@/types/moderation.interface";

const UUID = Joi.string().uuid();

/** A trimmed optional note; blank is the same as absent. */
const note = (max: number) => Joi.string().trim().max(max).empty("");

const PUBLIC_NOTE_MAX = 512;
const INTERNAL_NOTE_MAX = 2000;
/** `evidenceIds` on approve (review Q6). */
const EVIDENCE_IDS_MAX = 50;

const caseParams = Joi.object({ id: UUID.required() });

const OTHER_NEEDS_NOTE = "Add a note that explains the reason when you choose “Other”.";

/** Keyword-rule terms: 1–50 strings of 2–80 characters (§4.5). The service re-validates. */
const terms = Joi.array()
  .items(Joi.string().trim().min(2).max(80))
  .min(1)
  .max(50)
  .messages({
    "array.min": "A rule needs at least one term.",
    "array.max": "A rule can have at most 50 terms.",
  });

export const moderationSchemas: SchemaRegistry = {
  /** `GET /cases` */
  "moderation.caseList": {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(25),
      tab: Joi.string()
        .valid(...MODERATION_QUEUE_TABS)
        .default("all"),
      state: Joi.string().valid("open", "resolved").default("open"),
      targetType: Joi.string().valid("report", "comment"),
      urgent: Joi.boolean(),
      search: Joi.string().trim().max(120).allow(""),
      sort: Joi.string().valid("priority", "newest", "oldest").default("priority"),
    }),
  },

  /**
   * `GET /cases/summary`, `GET /stats` — no input. Registered anyway so every
   * route passes through `validate` (unknown query keys are stripped), and a
   * filter added later has one obvious place to go.
   */
  "moderation.caseSummary": {
    query: Joi.object({}),
  },

  "moderation.stats": {
    query: Joi.object({}),
  },

  /** `GET /cases/:id`, `POST /cases/:id/rerun` */
  "moderation.caseId": {
    params: caseParams,
  },

  /** `GET /cases/:id/evidence/:evidenceId` */
  "moderation.caseEvidence": {
    params: Joi.object({ id: UUID.required(), evidenceId: UUID.required() }),
  },

  /**
   * `POST /cases/:id/approve`. `evidenceIds` (review Q6) — the sealed files
   * the console rendered on the case — are the only files the approval
   * releases; absent means none. 50 is above the per-report file cap.
   */
  "moderation.approve": {
    params: caseParams,
    body: Joi.object({
      internalNote: note(INTERNAL_NOTE_MAX),
      contentVersion: Joi.number().integer().min(1),
      evidenceIds: Joi.array()
        .items(UUID)
        .max(EVIDENCE_IDS_MAX)
        .unique()
        .messages({
          "array.max": `An approval can list at most ${EVIDENCE_IDS_MAX} files.`,
          "array.unique": "A file is listed twice.",
          "string.guid": "One of the listed files is not a valid id.",
        }),
    }),
  },

  /** `POST /cases/:id/reject` */
  "moderation.reject": {
    params: caseParams,
    body: Joi.object({
      reasonCode: Joi.string()
        .valid(...REJECT_REASON_CODES)
        .required()
        .messages({ "any.required": "Choose a reason — the author is told it.", "any.only": "Choose one of the rejection reasons." }),
      publicNote: note(PUBLIC_NOTE_MAX).when("reasonCode", {
        is: "other",
        then: Joi.required().messages({ "any.required": OTHER_NEEDS_NOTE }),
      }),
      internalNote: note(INTERNAL_NOTE_MAX),
      contentVersion: Joi.number().integer().min(1),
    }),
  },

  /** `POST /cases/:id/evidence/:evidenceId/reject` */
  "moderation.evidenceReject": {
    params: Joi.object({ id: UUID.required(), evidenceId: UUID.required() }),
    body: Joi.object({
      reasonCode: Joi.string().valid(...REJECT_REASON_CODES),
      internalNote: note(INTERNAL_NOTE_MAX).when("reasonCode", {
        is: "other",
        then: Joi.required().messages({ "any.required": OTHER_NEEDS_NOTE }),
      }),
    }),
  },

  /** `POST /members/:id/ban` */
  "moderation.ban": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      reasonCode: Joi.string()
        .valid(...BAN_REASON_CODES)
        .required()
        .messages({ "any.required": "Choose a ban reason.", "any.only": "Choose one of the ban reasons." }),
      note: note(INTERNAL_NOTE_MAX).when("reasonCode", {
        is: "other",
        then: Joi.required().messages({ "any.required": OTHER_NEEDS_NOTE }),
      }),
      // Optional link to the case the ban was issued from, for its history.
      caseId: UUID,
    }),
  },

  /** `POST /members/:id/unban` */
  "moderation.unban": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      note: note(INTERNAL_NOTE_MAX),
      caseId: UUID,
    }),
  },

  /** `GET /keyword-rules` */
  "moderation.ruleList": {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(25),
      search: Joi.string().trim().max(120).allow(""),
      action: Joi.string().valid(...ALL_KEYWORD_ACTIONS),
      enabled: Joi.boolean(),
      category: Joi.string().valid(...POLICY_CATEGORIES),
      appliesTo: Joi.string().valid(...ALL_KEYWORD_APPLIES_TO),
    }),
  },

  /** `GET /keyword-rules/:id`, `DELETE /keyword-rules/:id` */
  "moderation.ruleId": {
    params: Joi.object({ id: UUID.required() }),
  },

  /** `POST /keyword-rules` */
  "moderation.ruleCreate": {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(80).required(),
      category: Joi.string()
        .valid(...POLICY_CATEGORIES)
        .required(),
      terms: terms.required(),
      action: Joi.string().valid(...ALL_KEYWORD_ACTIONS),
      appliesTo: Joi.string().valid(...ALL_KEYWORD_APPLIES_TO),
      enabled: Joi.boolean(),
    }),
  },

  /** `PATCH /keyword-rules/:id` — only the fields sent change. */
  "moderation.ruleUpdate": {
    params: Joi.object({ id: UUID.required() }),
    body: Joi.object({
      name: Joi.string().trim().min(2).max(80),
      category: Joi.string().valid(...POLICY_CATEGORIES),
      terms,
      action: Joi.string().valid(...ALL_KEYWORD_ACTIONS),
      appliesTo: Joi.string().valid(...ALL_KEYWORD_APPLIES_TO),
      enabled: Joi.boolean(),
    })
      .min(1)
      .messages({ "object.min": "Send at least one field to change." }),
  },

  /** `POST /maintenance` — no input; the job takes none. */
  "moderation.maintenance": {
    body: Joi.object({}),
  },

  /** `POST /broadcast` — unchanged from before revision 2. */
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
