/**
 * FAQ schemas.
 *
 * The public read takes a surface; everything else is the console's editing
 * surface. `surfaces` is validated as a set rather than a free array — an entry
 * tagged for a surface that does not exist would simply never render, which is
 * the kind of failure that gets diagnosed as "the API is broken".
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { ALL_FAQ_STATUSES, ALL_FAQ_SURFACES } from "@/types/faq.interface";

const SURFACES = Joi.array()
  .items(Joi.string().valid(...ALL_FAQ_SURFACES))
  .unique()
  .min(0)
  .max(ALL_FAQ_SURFACES.length)
  .messages({
    "array.unique": "Each surface can only be listed once.",
  });

const CATEGORY_ID = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z0-9-]{1,64}$/)
  .messages({
    "string.pattern.base": "That is not a category we recognise.",
  });

/**
 * Generous bounds.
 *
 * An FAQ answer is prose written by an editor in a textarea, and a limit that
 * truncates a carefully worded legal answer is worse than a long row.
 */
const QUESTION = Joi.string().trim().min(3).max(500).messages({
  "string.empty": "Write the question.",
  "string.min": "That question is too short to be one.",
  "string.max": "That question is too long — put the detail in the answer.",
});

const ANSWER = Joi.string().trim().min(3).max(8000).messages({
  "string.empty": "Write the answer.",
  "string.max": "That answer is too long.",
});

export const faqSchemas: SchemaRegistry = {
  /** `GET /api/v1/help/faq?surface=` — public. */
  "faq.public": {
    query: Joi.object({
      // Defaults to the app, which is the contract the mobile client already
      // ships against — it sends no surface at all.
      surface: Joi.string()
        .valid(...ALL_FAQ_SURFACES)
        .default("app"),
    }),
  },

  "faq.list": {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().trim().max(200).allow("").optional(),
      status: Joi.string()
        .valid(...ALL_FAQ_STATUSES)
        .optional(),
      categoryId: CATEGORY_ID.optional(),
      surface: Joi.string()
        .valid(...ALL_FAQ_SURFACES)
        .optional(),
    }),
  },

  "faq.id": {
    params: Joi.object({
      id: Joi.string().uuid().required().messages({
        "string.guid": "That FAQ reference is not valid.",
      }),
    }),
  },

  "faq.create": {
    body: Joi.object({
      question: QUESTION.required(),
      answer: ANSWER.required(),
      categoryId: CATEGORY_ID.required().messages({
        "any.required": "Choose a category.",
      }),
      status: Joi.string()
        .valid(...ALL_FAQ_STATUSES)
        .optional(),
      surfaces: SURFACES.optional(),
      startHere: Joi.boolean().optional(),
      sortOrder: Joi.number().integer().min(0).max(100000).optional(),
    }),
  },

  "faq.update": {
    params: Joi.object({
      id: Joi.string().uuid().required(),
    }),
    body: Joi.object({
      question: QUESTION.optional(),
      answer: ANSWER.optional(),
      categoryId: CATEGORY_ID.optional(),
      status: Joi.string()
        .valid(...ALL_FAQ_STATUSES)
        .optional(),
      surfaces: SURFACES.optional(),
      startHere: Joi.boolean().optional(),
      sortOrder: Joi.number().integer().min(0).max(100000).optional(),
    })
      .min(1)
      .messages({ "object.min": "Nothing to update." }),
  },
};

export default faqSchemas;
