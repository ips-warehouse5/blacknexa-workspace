/**
 * Incident Management schemas — `/api/v1/admin/incidents`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §9.1 and §3.3. Dismiss and deactivate reasons
 * come from their own catalogues in the shared vocabulary; `other` needs the
 * author-facing `publicNote` (the author reads the label and the note). Verify,
 * reopen and reactivate notes are internal — stored as `report_notes` — and
 * reopening requires one, because a dismissal being undone needs a reason on
 * the record.
 *
 * `assignee` on the list takes `me`, `unassigned` or an admin id; advocates
 * are scoped to their own assignments by the service whatever they send. Dates
 * are ISO strings: a bare `YYYY-MM-DD` covers that whole UTC day.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { ALL_REPORT_CATEGORIES } from "@/types/report.interface";
import { DEACTIVATE_REASON_CODES, DISMISS_REASON_CODES } from "@/types/moderation.interface";

const UUID = Joi.string().uuid();

/** A trimmed optional note; blank is the same as absent. */
const note = (max: number) => Joi.string().trim().max(max).empty("");

const idParams = Joi.object({ id: UUID.required() });

const OTHER_NEEDS_NOTE = "Add a note that explains the reason when you choose “Other”.";

/**
 * An ISO date or date-time, passed through *unchanged*. Not `string().isoDate()`:
 * under the global `convert: true` Joi rewrites `2026-09-01` to
 * `2026-09-01T00:00:00.000Z`, and a `to` bound would then stop at midnight
 * instead of covering the whole day the console picked.
 */
const isoDate = Joi.string()
  .trim()
  .max(40)
  .custom((value: string, helpers) => {
    const shaped = /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value);
    return shaped && !Number.isNaN(Date.parse(value)) ? value : helpers.error("any.invalid");
  }, "ISO 8601 date")
  .messages({ "any.invalid": "Dates must be ISO 8601, for example 2026-09-01." });

/** `me`, `unassigned`, or an admin id. */
const assignee = Joi.alternatives().try(
  Joi.string().valid("me", "unassigned"),
  UUID.messages({ "string.guid": "assignee must be me, unassigned or an admin id." }),
);

export const incidentSchemas: SchemaRegistry = {
  /** `GET /admin/incidents` */
  "incident.list": {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(25),
      status: Joi.string()
        .valid("all", "submitted", "under_review", "verified", "dismissed", "deactivated")
        .default("all"),
      category: Joi.string().valid("all", ...ALL_REPORT_CATEGORIES),
      from: isoDate,
      to: isoDate,
      range: Joi.string().valid("today", "week", "month"),
      search: Joi.string().trim().max(120).allow(""),
      sort: Joi.string().valid("newest", "oldest").default("newest"),
      assignee,
      moderation: Joi.string().valid("pending", "held", "approved", "rejected"),
      urgent: Joi.boolean(),
    }),
  },

  /** `GET /admin/incidents/summary` */
  "incident.summary": {
    query: Joi.object({ assignee }),
  },

  /**
   * `GET /admin/incidents/metrics` — the dashboard's range. Day buckets for
   * 7d / 30d / 90d, month buckets for 12m (the service's `metricsWindow`).
   */
  "incident.metrics": {
    query: Joi.object({
      range: Joi.string()
        .valid("7d", "30d", "90d", "12m")
        .default("7d")
        .messages({ "any.only": "range must be one of 7d, 30d, 90d or 12m." }),
    }),
  },

  /** `GET /admin/incidents/assignees` — no input (unknown keys are stripped). */
  "incident.assignees": {
    query: Joi.object({}),
  },

  /** `GET /admin/incidents/:id` */
  "incident.id": {
    params: idParams,
  },

  /** `GET /admin/incidents/:id/evidence/:evidenceId` */
  "incident.evidence": {
    params: Joi.object({ id: UUID.required(), evidenceId: UUID.required() }),
  },

  /** `POST /:id/verify` — the note is internal (report_notes). */
  "incident.verify": {
    params: idParams,
    body: Joi.object({ note: note(2000) }),
  },

  /** `POST /:id/dismiss` */
  "incident.dismiss": {
    params: idParams,
    body: Joi.object({
      reasonCode: Joi.string()
        .valid(...DISMISS_REASON_CODES)
        .required()
        .messages({ "any.required": "Choose a dismissal reason.", "any.only": "Choose one of the dismissal reasons." }),
      // Written on the status event the author's timeline shows (512).
      publicNote: note(512).when("reasonCode", {
        is: "other",
        then: Joi.required().messages({ "any.required": OTHER_NEEDS_NOTE }),
      }),
      internalNote: note(2000),
    }),
  },

  /** `POST /:id/reopen` — a reason is required. */
  "incident.reopen": {
    params: idParams,
    body: Joi.object({
      note: note(2000).required().messages({ "any.required": "Say why the case is being reopened." }),
    }),
  },

  /** `POST /:id/deactivate` */
  "incident.deactivate": {
    params: idParams,
    body: Joi.object({
      reasonCode: Joi.string()
        .valid(...DEACTIVATE_REASON_CODES)
        .required()
        .messages({
          "any.required": "Choose a deactivation reason.",
          "any.only": "Choose one of the deactivation reasons.",
        }),
      // `reports.moderation_note`, shown to the author on D2 (512).
      publicNote: note(512).when("reasonCode", {
        is: "other",
        then: Joi.required().messages({ "any.required": OTHER_NEEDS_NOTE }),
      }),
      internalNote: note(2000),
    }),
  },

  /** `POST /:id/reactivate` */
  "incident.reactivate": {
    params: idParams,
    body: Joi.object({ note: note(2000) }),
  },

  /** `POST /:id/assign` — `adminId: null` unassigns. */
  "incident.assign": {
    params: idParams,
    body: Joi.object({
      adminId: UUID.allow(null).required().messages({
        "any.required": "Choose who to assign the case to, or send null to unassign it.",
      }),
    }),
  },

  /** `POST /:id/notes` */
  "incident.note": {
    params: idParams,
    body: Joi.object({
      body: Joi.string().trim().min(1).max(2000).required().messages({
        "any.required": "Write the note first.",
        "string.empty": "Write the note first.",
        "string.max": "Keep a note under 2,000 characters.",
      }),
    }),
  },
};

export default incidentSchemas;
