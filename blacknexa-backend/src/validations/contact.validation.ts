/**
 * Contact-us schemas.
 *
 * `contact.submit` is the only schema in the project written against an
 * unauthenticated, public form, so its bounds do real work: every field is
 * length-capped, and `stripUnknown` (set globally in the validate middleware)
 * drops anything else the caller sends — which is what stops a submission
 * arriving with `status: "resolved"` or a `handledBy` of someone else's id.
 *
 * The floors match the website form's own validation (`contact-form.tsx`), so a
 * message the form accepts is never rejected by the server and vice versa. A
 * server that refuses what the form allows is as confusing as the reverse.
 */

import Joi from "joi";

import type { SchemaRegistry } from "@/validations";
import { CONTACT_STATUSES, CONTACT_SUBJECTS } from "@/types/contact.interface";

const email = Joi.string()
  .trim()
  .lowercase()
  // `tlds: false` matches the rest of the project: the TLD allow-list Joi ships
  // with goes stale, and rejecting a valid new TLD is worse than accepting an
  // implausible one on a contact form.
  .email({ tlds: { allow: false } })
  .max(255);

export const contactSchemas: SchemaRegistry = {
  /** `POST /api/v1/contact` — public. */
  "contact.submit": {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(255).required().messages({
        "any.required": "Please tell us your name.",
        "string.min": "Please tell us your name.",
      }),
      email: email.required().messages({
        "any.required": "We need an email address to reply to.",
        "string.email": "That email address does not look right.",
      }),
      subject: Joi.string()
        .valid(...CONTACT_SUBJECTS)
        .default("general"),
      /*
       * 12 characters is the website form's floor. The 5,000-character ceiling
       * is the one the form does not have: it is a TEXT column, and an
       * unauthenticated endpoint with no upper bound is a way to fill a disk.
       */
      message: Joi.string().trim().min(12).max(5000).required().messages({
        "any.required": "Please include a message.",
        "string.min": "A little more detail helps us route this.",
        "string.max": "Please keep the message under 5,000 characters.",
      }),
    }),
  },

  /** `GET /api/v1/admin/contact` */
  "contact.list": {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      // Capped so a caller cannot pull the whole table in one request.
      limit: Joi.number().integer().min(1).max(100).default(10),
      search: Joi.string().trim().max(120).allow(""),
      status: Joi.string().valid(...CONTACT_STATUSES),
      subject: Joi.string().valid(...CONTACT_SUBJECTS),
    }),
  },

  /** `GET /api/v1/admin/contact/:id` and `DELETE /api/v1/admin/contact/:id` */
  "contact.id": {
    params: Joi.object({ id: Joi.string().uuid().required() }),
  },

  /** `PATCH /api/v1/admin/contact/:id` */
  "contact.update": {
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({
      status: Joi.string().valid(...CONTACT_STATUSES),
      // `allow("")` is what lets an operator clear a note; `null` is not
      // accepted, so "no value sent" and "sent as empty" stay distinguishable
      // all the way down to the service.
      internalNote: Joi.string().trim().max(2000).allow(""),
    })
      // An empty PATCH is a caller mistake, not a no-op worth stamping an
      // operator's name onto.
      .min(1)
      .messages({ "object.min": "Provide a status or a note to update." }),
  },
};

export default contactSchemas;
