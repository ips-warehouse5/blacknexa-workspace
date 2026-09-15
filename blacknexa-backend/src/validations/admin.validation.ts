/**
 * Admin authentication and staff-management schemas.
 *
 * The password policy applies to passwords being *set*. Login deliberately does
 * not enforce complexity: rejecting a login for a weak password would tell an
 * attacker the password failed a policy check rather than a comparison, and it
 * would lock out an account whose password predates a policy change.
 */

import Joi from "joi";

import type { SchemaRegistry } from "@/validations";
import { ALL_ADMIN_ROLES } from "@/types/admin.interface";

/** Roles a staff endpoint may assign. Super Admin is not among them. */
const ASSIGNABLE_ROLES = ALL_ADMIN_ROLES.filter((role) => role !== "superadmin");

const email = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } })
  .max(255);

/**
 * Length carries most of the strength, so the floor is 12 rather than 8. The
 * class rules are kept because the console enforces the same three, and a server
 * that accepts what the form rejects is as confusing as the reverse.
 */
const password = Joi.string()
  .min(12)
  .max(200)
  .pattern(/[a-z]/, "lowercase")
  .pattern(/[A-Z]/, "uppercase")
  .pattern(/\d/, "number")
  .messages({
    "string.min": "password must be at least 12 characters",
    "string.pattern.name":
      "password must contain lowercase, uppercase and numeric characters",
  });

/** A six-digit one-time code. */
const otpCode = Joi.string()
  .trim()
  .pattern(/^\d{6}$/)
  .messages({ "string.pattern.base": "Enter the 6-digit code from your email." });

export const adminSchemas: SchemaRegistry = {
  "admin.login": {
    body: Joi.object({
      email: email.required().messages({
        "any.required": "email is required",
        "string.email": "A valid email address is required",
      }),
      // Only bounded, not complexity-checked — see the file comment.
      password: Joi.string().min(1).max(200).required().messages({
        "any.required": "password is required",
      }),
      /*
       * Accepted and discarded. The console sends it because it decides where
       * to keep its own refresh token; the server has no use for it, and
       * stripUnknown would otherwise reject the request outright.
       */
      remember: Joi.boolean().default(false).strip(),
    }),
  },

  "admin.mfaVerify": {
    body: Joi.object({
      challengeId: Joi.string().uuid().required(),
      code: otpCode.required(),
    }),
  },

  "admin.mfaResend": {
    body: Joi.object({
      challengeId: Joi.string().uuid().required(),
    }),
  },

  "admin.refresh": {
    body: Joi.object({
      refreshToken: Joi.string().trim().min(20).max(4096).required().messages({
        "any.required": "refreshToken is required",
      }),
    }),
  },

  "admin.forgotPassword": {
    body: Joi.object({
      email: email.required(),
    }),
  },

  "admin.resetPassword": {
    body: Joi.object({
      email: email.required(),
      code: otpCode.required(),
      password: password.required(),
    }),
  },

  // ── Staff directory ───────────────────────────────────────────────────────

  "admin.staffList": {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      // Capped so a caller cannot ask for the whole table in one request.
      limit: Joi.number().integer().min(1).max(100).default(10),
      search: Joi.string().trim().max(120).allow(""),
      role: Joi.string().valid(...ALL_ADMIN_ROLES),
      status: Joi.string().valid("active", "disabled"),
    }),
  },

  "admin.staffCreate": {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(255).required(),
      email: email.required(),
      // Assigning Super Admin from this endpoint is refused in the service too;
      // rejecting it here makes the contract visible in the schema.
      role: Joi.string()
        .valid(...ASSIGNABLE_ROLES)
        .default("staff"),
      password: password.required(),
    }),
  },

  "admin.staffUpdate": {
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({
      name: Joi.string().trim().min(2).max(255),
      role: Joi.string().valid(...ASSIGNABLE_ROLES),
    })
      // An empty PATCH is a caller mistake, not a no-op worth accepting.
      .min(1)
      .messages({ "object.min": "Provide at least one field to update." }),
  },

  "admin.staffStatus": {
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({
      isActive: Joi.boolean().required(),
    }),
  },

  "admin.staffId": {
    params: Joi.object({ id: Joi.string().uuid().required() }),
  },
};

export default adminSchemas;
