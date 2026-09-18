/**
 * Place-search schema.
 *
 * One route, one rule: a query that is present and bounded. The two-character
 * minimum matches the service, which refuses to call the upstream below it — a
 * one-letter search returns every city on Earth beginning with that letter and
 * is never what the person meant.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";

export const locationSchemas: SchemaRegistry = {
  "location.search": {
    query: Joi.object({
      q: Joi.string().trim().min(2).max(120).required().messages({
        "any.required": "Type a city or postal code.",
        "string.empty": "Type a city or postal code.",
        "string.min": "Type at least two characters.",
      }),
    }),
  },
};

export default locationSchemas;
