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

/**
 * The four requirement rows on screens A6 and A14, in one place.
 *
 * The symbol class excludes whitespace deliberately. `/[^A-Za-z0-9]/` matches a
 * plain space, so "Passwordd1 " satisfied all four rules and registered — the
 * server, which is the authoritative validator, accepted a password the rule text
 * says it should not. `\s` is excluded here to match the client checks in
 * `lib/auth/signup-validation.ts` and `lib/auth/reset-validation.ts`.
 */
const PASSWORD = Joi.string()
  .min(10)
  .max(200)
  .pattern(/[A-Z]/, "capital")
  .pattern(/\d/, "number")
  .pattern(/[^A-Za-z0-9\s]/, "symbol")
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

/**
 * The name collected on sign-up step 1.
 *
 * First name is required and last name is not, which is the tester's request and
 * also the only safe reading of a global user base — plenty of people have one
 * name, and refusing them a sign-up over a second field is not a validation win.
 */
const FIRST_NAME = Joi.string().trim().min(1).max(80).required().messages({
  "any.required": "Enter your first name.",
  "string.empty": "Enter your first name.",
  "string.max": "That first name is too long.",
});

const LAST_NAME = Joi.string().trim().max(80).allow("").optional().messages({
  "string.max": "That last name is too long.",
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
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
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
      // Correctable after sign-up. Unlike registration the first name is
      // optional *here* — a PATCH names only the fields it changes.
      firstName: Joi.string().trim().max(80).optional(),
      lastName: Joi.string().trim().max(80).allow("").optional(),
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

  /**
   * `DELETE /users/me/sessions/:id` — revoke one device.
   *
   * Only the id is validated here; that the session belongs to the caller is a
   * question about data, not shape, so the service answers it.
   */
  "userAuth.sessionId": {
    params: Joi.object({
      id: Joi.string().uuid().required().messages({
        "string.guid": "That is not a device we recognise.",
      }),
    }),
  },

  /**
   * `PATCH /users/me/area`.
   *
   * The coordinates are bounded rather than merely numeric. That catches a
   * longitude landing in the latitude field for most of the world — anything
   * past ±90 is refused outright — but it is worth being honest about the
   * limit: a swap where both values happen to fall inside ±90 passes, because
   * the pair is then genuinely a point on Earth and no schema can know it is
   * not the one that was meant. The bound is a cheap filter, not a proof.
   */
  "userAuth.updateArea": {
    body: Joi.object({
      label: Joi.string().trim().min(1).max(160).required().messages({
        "any.required": "Choose an area.",
        "string.empty": "Choose an area.",
      }),
      lat: Joi.number().min(-90).max(90).required().messages({
        "number.min": "That latitude is not on Earth.",
        "number.max": "That latitude is not on Earth.",
      }),
      lng: Joi.number().min(-180).max(180).required().messages({
        "number.min": "That longitude is not on Earth.",
        "number.max": "That longitude is not on Earth.",
      }),
    }),
  },

  /**
   * `POST /users/me/avatar/presign`.
   *
   * The accepted types are the ones a phone camera and library actually produce.
   * The service re-checks this before signing — a schema is the first gate, not
   * the only one.
   */
  "userAuth.avatarPresign": {
    body: Joi.object({
      mime: Joi.string()
        .trim()
        .lowercase()
        .valid("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")
        .required()
        .messages({
          "any.only": "That kind of file cannot be a profile photo.",
          "any.required": "Tell us what kind of image this is.",
        }),
    }),
  },

  /**
   * `POST /users/me/avatar/commit`.
   *
   * The key is bounded and character-restricted here, but the check that
   * actually matters is in the service: the key must sit under *this* member's
   * avatar prefix, or one member could adopt another's upload by guessing.
   */
  "userAuth.avatarCommit": {
    body: Joi.object({
      storageKey: Joi.string()
        .trim()
        .max(512)
        .pattern(/^[A-Za-z0-9/_.-]+$/)
        .required()
        .messages({
          "string.pattern.base": "That upload reference is not valid.",
          "any.required": "That upload reference is not valid.",
        }),
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
