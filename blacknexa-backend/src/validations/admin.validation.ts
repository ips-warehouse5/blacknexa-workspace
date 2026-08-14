/**
 * Admin authentication schemas.
 *
 * The password policy applies to *new* admins only. Login deliberately does not
 * enforce complexity: rejecting a login for a weak password would tell an attacker
 * the password failed a policy check rather than a comparison, and it would lock
 * out an account whose password predates a policy change.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { ALL_ADMIN_ROLES } from "@/types/admin.interface";

export const adminSchemas: SchemaRegistry = {
  "admin.login": {
    body: Joi.object({
      email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required().messages({
        "any.required": "email is required",
        "string.email": "A valid email address is required",
      }),
      // Only bounded, not complexity-checked — see the file comment.
      password: Joi.string().min(1).max(200).required().messages({
        "any.required": "password is required",
      }),
    }),
  },

  "admin.refresh": {
    body: Joi.object({
      refreshToken: Joi.string().trim().min(20).max(4096).required().messages({
        "any.required": "refreshToken is required",
      }),
    }),
  },

  "admin.create": {
    body: Joi.object({
      email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required(),
      name: Joi.string().trim().min(1).max(255).required(),
      password: Joi.string()
        .min(12)
        .max(200)
        .pattern(/[a-z]/, "lowercase")
        .pattern(/[A-Z]/, "uppercase")
        .pattern(/\d/, "number")
        .required()
        .messages({
          "string.min": "password must be at least 12 characters",
          "string.pattern.name":
            "password must contain lowercase, uppercase and numeric characters",
        }),
      role: Joi.string()
        .valid(...ALL_ADMIN_ROLES)
        .default("admin"),
    }),
  },
};

export default adminSchemas;
