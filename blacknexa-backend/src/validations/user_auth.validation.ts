/**
 * End-user authentication schemas.
 *
 * ── The password policy lives here, once ────────────────────────────────────
 * Screen A6 prints four requirements as rows that stay neutral grey until met:
 * at least 10 characters, one capital letter, one number, one symbol. A14 repeats
 * them. `PASSWORD` below is the single expression of that policy, so the server
 * cannot drift from what the UI promised.
 *
 * The messages are written as the sentence the client prints under the field —
 * A6's rule is "tapping Continue with something missing scrolls to the first
 * problem and prints the rule in words", so a Joi message here is user-facing
 * copy, not developer diagnostics.
 *
 * Login deliberately does **not** apply the policy: rejecting a sign-in for a
 * weak password tells an attacker the value failed a format check rather than a
 * comparison, and it would lock out an account whose password predates a policy
 * change.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import {
  ALL_AVATAR_MODES,
  ALL_PRECISIONS,
  ALL_VISIBILITIES,
} from "@/types/user.interface";

const EMAIL = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } })
  .max(255)
  .required()
  .messages({
    "any.required": "Enter your email address.",
    "string.email": "That does not look like an email address.",
    "string.empty": "Enter your email address.",
  });

/** The four requirement rows on screens A6 and A14, in one place. */
const PASSWORD = Joi.string()
  .min(10)
  .max(200)
  .pattern(/[A-Z]/, "capital")
  .pattern(/\d/, "number")
  .pattern(/[^A-Za-z0-9]/, "symbol")
  .required()
  .messages({
    "any.required": "Choose a password.",
    "string.empty": "Choose a password.",
    "string.min": "Use at least 10 characters.",
    "string.max": "That password is too long.",
    "string.pattern.name":
      "Include a capital letter, a number and a symbol.",
  });

/** The six-digit code from A8 and A14. Digits only, so paste-with-spaces fails clearly. */
const OTP_CODE = Joi.string()
  .trim()
  .pattern(/^\d{4,8}$/)
  .required()
  .messages({
    "any.required": "Enter the code we sent you.",
    "string.empty": "Enter the code we sent you.",
    "string.pattern.base": "That code should be six digits.",
  });

/** Optional device context for the session list in Profile → Security. */
const DEVICE = {
  deviceLabel: Joi.string().trim().max(120).allow("").optional(),
  platform: Joi.string().trim().valid("ios", "android", "web", "unknown").optional(),
};

export const userAuthSchemas: SchemaRegistry = {
  "userAuth.register": {
    body: Joi.object({
      email: EMAIL,
      password: PASSWORD,
      ...DEVICE,
    }),
  },

  "userAuth.verifyEmail": {
    body: Joi.object({
      email: EMAIL,
      code: OTP_CODE,
      ...DEVICE,
    }),
  },

  "userAuth.resendCode": {
    body: Joi.object({
      email: EMAIL,
      purpose: Joi.string().valid("verify_email", "reset_password").required(),
    }),
  },

  "userAuth.login": {
    body: Joi.object({
      email: EMAIL,
      // Bounded only — see the file header.
      password: Joi.string().min(1).max(200).required().messages({
        "any.required": "Enter your password.",
        "string.empty": "Enter your password.",
      }),
      ...DEVICE,
    }),
  },

  "userAuth.socialLogin": {
    params: Joi.object({
      provider: Joi.string().valid("apple", "google").required(),
    }),
    body: Joi.object({
      // Mirrored from the path so the service reads one source.
      provider: Joi.string().valid("apple", "google").optional(),
      identityToken: Joi.string().trim().min(20).max(8192).required().messages({
        "any.required": "That sign-in did not complete.",
      }),
      // Apple returns the name only on first authorisation.
      fullName: Joi.string().trim().max(120).allow("").optional(),
      ...DEVICE,
    }),
  },

  "userAuth.refresh": {
    body: Joi.object({
      refreshToken: Joi.string().trim().min(20).max(4096).required().messages({
        "any.required": "refreshToken is required",
      }),
    }),
  },

  "userAuth.forgotPassword": {
    body: Joi.object({
      email: EMAIL,
    }),
  },

  "userAuth.resetPassword": {
    body: Joi.object({
      email: EMAIL,
      code: OTP_CODE,
      password: PASSWORD,
      ...DEVICE,
    }),
  },

  "userAuth.updateProfile": {
    body: Joi.object({
      // A9's display name. Empty is legitimate — it means "publish as Anonymous",
      // which the avatar mode expresses separately.
      displayName: Joi.string().trim().max(120).allow("").optional(),
      avatarMode: Joi.string()
        .valid(...ALL_AVATAR_MODES)
        .optional(),
      anonymousByDefault: Joi.boolean().optional(),
      defaultVisibility: Joi.string()
        .valid(...ALL_VISIBILITIES)
        .optional(),
      defaultPrecision: Joi.string()
        .valid(...ALL_PRECISIONS)
        .optional(),
      // One switch, not four — screen A11.
      notificationsEnabled: Joi.boolean().optional(),
      language: Joi.string().trim().lowercase().min(2).max(8).optional(),
    })
      .min(1)
      .messages({ "object.min": "Nothing to update." }),
  },

  "userAuth.recordConsents": {
    body: Joi.object({
      documents: Joi.array()
        .items(Joi.string().valid("tos", "privacy"))
        .min(1)
        .unique()
        .required(),
      version: Joi.number().integer().min(1).required(),
    }),
  },

  "userAuth.registerDevice": {
    body: Joi.object({
      pushToken: Joi.string().trim().min(10).max(255).required(),
      platform: Joi.string().trim().valid("ios", "android", "web", "unknown").optional(),
      deviceLabel: Joi.string().trim().max(120).allow("").optional(),
    }),
  },

  /**
   * `DELETE /users/me`.
   *
   * `disposition` has no default on purpose — see the controller. `password` and
   * `code` are both optional here because which one is required depends on whether
   * the account has a password at all, which only the service knows; it returns a
   * message naming the one it wants.
   */
  "userAuth.deleteAccount": {
    body: Joi.object({
      disposition: Joi.string()
        .valid("sever", "erase")
        .required()
        .messages({
          "any.only":
            "Choose whether the reports you filed stay as anonymous record or are erased too.",
          "any.required": "Choose what happens to the reports you filed.",
        }),
      password: Joi.string().max(128).optional(),
      code: Joi.string()
        .trim()
        .pattern(/^[0-9]{4,8}$/)
        .optional()
        .messages({ "string.pattern.base": "That code should be six digits." }),
    }).or("password", "code").messages({
      "object.missing": "Confirm it is you before we delete the account.",
    }),
  },
};

export default userAuthSchemas;
