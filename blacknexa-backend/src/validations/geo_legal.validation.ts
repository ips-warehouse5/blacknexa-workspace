/**
 * Geo-Legal request schemas.
 *
 * Written against `GeoLegalProvider.tsx`, which sends the full `ReportDraft` and
 * `ValidationResult` objects back to the server on validate/dispatch/create. Those
 * nested shapes are described here rather than accepted blindly, because
 * `formattedSummary` from a validation result is what gets encrypted and stored,
 * and `category` selects which agencies a report is routed to.
 */

import Joi from "joi";
import type { SchemaRegistry } from "@/validations";
import { ALL_INCIDENT_CATEGORIES } from "@/types/news.interface";
import { SUPPORTED_LANGUAGES } from "@/services/i18n.service";

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

const PRIVACY_REGIMES = [
  "GDPR",
  "CCPA",
  "PIPEDA",
  "LGPD",
  "POPIA",
  "UK_DPA",
  "APP",
  "PDPA",
  "GENERAL",
] as const;

const DISPATCH_CHANNELS = ["GOVT_AGENCY", "PRESS", "HUMAN_RIGHTS", "LEGAL_NETWORK"] as const;

/** ISO-3166 alpha-2, uppercased. */
const countryCode = Joi.string().trim().uppercase().length(2).required().messages({
  "string.length": "countryCode must be a 2-letter ISO country code",
});

/** The report draft the app builds. */
const reportDraft = Joi.object({
  title: Joi.string().trim().max(300).allow("").required(),
  summary: Joi.string().trim().max(20_000).allow("").required(),
  category: Joi.string()
    .valid(...ALL_INCIDENT_CATEGORIES)
    .required(),
  area: Joi.string().trim().max(300).allow("").required(),
  countryCode: Joi.string().trim().uppercase().length(2).required(),
  subdivisionCode: Joi.string().trim().max(16).allow("").optional(),
  occurredAt: Joi.string().trim().max(64).allow("").optional(),
  userIsParticipant: Joi.boolean().optional(),
  obtainedExplicitConsent: Joi.boolean().optional(),
  inPublicSpace: Joi.boolean().optional(),
}).required();

/** The validation result returned earlier by `/validate` and echoed back. */
const validationResult = Joi.object({
  compliant: Joi.boolean().required(),
  missingFields: Joi.array().items(Joi.string().max(500)).default([]),
  formattingIssues: Joi.array().items(Joi.string().max(1000)).default([]),
  // This is the text that gets PII-scrubbed, encrypted and stored.
  formattedSummary: Joi.string().max(60_000).allow("").required(),
  requiresHumanConfirmation: Joi.boolean().required(),
  governingJurisdiction: Joi.string().trim().max(8).allow("").optional(),
  privacyRegime: Joi.string()
    .valid(...PRIVACY_REGIMES)
    .default("GENERAL"),
  validatedAt: Joi.string().trim().max(64).allow("").optional(),
}).required();

/** A client-sealed evidence package. The payload is opaque ciphertext. */
const sealedEvidence = Joi.object({
  incidentId: Joi.string().trim().max(128).allow("").optional(),
  // Generous cap: this is base64 media, but unbounded input is a memory risk.
  sealedPayload: Joi.string().max(20 * 1024 * 1024).required(),
  mediaType: Joi.string().trim().max(64).required(),
  contentHash: Joi.string().trim().max(128).allow("").default(""),
  metadataScrubbed: Joi.boolean().default(false),
}).optional();

export const geoLegalSchemas: SchemaRegistry = {
  "geoLegal.lookup": {
    query: Joi.object({
      country: countryCode,
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
      // An unsupported code degrades to English rather than failing the lookup —
      // a reporter mid-incident must still get their agency list.
      lang: Joi.string()
        .valid(...LANGUAGE_CODES)
        .default("en"),
    }),
  },

  "geoLegal.validate": {
    body: Joi.object({
      reportDraft,
      countryCode,
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
    }),
  },

  "geoLegal.dispatch": {
    body: Joi.object({
      reportDraft,
      validation: validationResult,
      // Enforced as a literal `true`: nothing is routed without the reporter
      // explicitly confirming, and a missing flag must not be coerced.
      humanConfirmed: Joi.boolean().valid(true).required().messages({
        "any.only": "Human confirmation is required before dispatch.",
        "any.required": "Human confirmation is required before dispatch.",
      }),
      channels: Joi.array()
        .items(Joi.string().valid(...DISPATCH_CHANNELS))
        .min(1)
        .required(),
      incidentId: Joi.string().trim().max(128).allow("", null).optional(),
    }),
  },

  "geoLegal.createIncident": {
    body: Joi.object({
      userId: Joi.string().trim().max(255).allow("").default("anonymous"),
      countryCode,
      category: Joi.string()
        .valid(...ALL_INCIDENT_CATEGORIES)
        .required(),
      privacyLevel: Joi.string().valid("private", "trusted", "public").required(),
      reportDraft,
      validation: validationResult,
      sealedEvidence,
      humanConfirmed: Joi.boolean().valid(true).required().messages({
        "any.only": "Human confirmation is required.",
        "any.required": "Human confirmation is required.",
      }),
    }),
  },

  "geoLegal.incidentById": {
    params: Joi.object({
      id: Joi.string().trim().min(1).max(128).required(),
    }),
  },
};

export default geoLegalSchemas;
