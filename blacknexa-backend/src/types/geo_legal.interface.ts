/**
 * BlackNexa™ Geo-Legal & Compliance Routing Engine — shared types.
 *
 * These types mirror the Expo `constants/geo-legal.ts` models so the mobile
 * apps and the Worker speak the same shape.
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import type { IncidentCategory } from "@/types/news.interface";

/** ISO-3166 alpha-2 country code, uppercased. */
export type CountryCode = string;

/** A specific statute or legal instrument. */
export type LegalFramework = {
  /** Short name, e.g. "UK Equality Act 2010". */
  name: string;
  /** Citation or reference, e.g. "Equality Act 2010, c. 15". */
  citation: string;
  /** One-line summary of what it covers. */
  summary: string;
  /** Categories this framework protects. */
  categories: IncidentCategory[];
  /** Official URL if available. */
  url?: string;
};

/** Accredited government oversight agency, human rights commission, or ombudsman. */
export type OversightAgency = {
  id: string;
  name: string;
  /** Agency tier. */
  tier: "NATIONAL" | "REGIONAL" | "LOCAL" | "INTERNATIONAL";
  /** Official website / intake portal. */
  portalUrl: string;
  /** Intake email if available. */
  intakeEmail?: string;
  /** Phone number if available. */
  phone?: string;
  /** Categories this agency handles. */
  categories: IncidentCategory[];
  /** Short description. */
  description: string;
  /** Whether the contact was verified by AI lookup. */
  aiVerified: boolean;
};

/** Verified independent press / investigative media contact. */
export type PressContact = {
  id: string;
  name: string;
  /** Outlet type. */
  type: "INVESTIGATIVE" | "NATIONAL" | "REGIONAL" | "INTERNATIONAL";
  portalUrl: string;
  /** Tips/intake email if available. */
  intakeEmail?: string;
  /** Categories this outlet covers. */
  categories: IncidentCategory[];
  description: string;
  aiVerified: boolean;
};

/** Data privacy regime for a jurisdiction. */
export type PrivacyRegime =
  | "GDPR"
  | "CCPA"
  | "PIPEDA"
  | "LGPD"
  | "POPIA"
  | "UK_DPA"
  | "APP"
  | "PDPA"
  | "GENERAL";

/** Full jurisdiction profile for a country. */
export type JurisdictionProfile = {
  countryCode: string;
  countryName: string;
  /** Primary language code (BCP-47 short). */
  primaryLanguage: string;
  /** Data privacy regime governing personal data. */
  privacyRegime: PrivacyRegime;
  /** Legal frameworks / statutes governing discrimination & civil rights. */
  legalFrameworks: LegalFramework[];
  /** Accredited oversight agencies. */
  agencies: OversightAgency[];
  /** Verified press contacts. */
  pressContacts: PressContact[];
  /** Whether this profile came from the curated DB or AI generation. */
  source: "curated" | "ai-generated";
  /** ISO timestamp of when this profile was assembled/cached. */
  generatedAt: string;
};

/** Request shape for the lookup endpoint. */
export type GeoLegalLookupRequest = {
  country: string;
  lat?: number;
  lng?: number;
  lang?: string;
};

/** Response shape for the lookup endpoint. */
export type GeoLegalLookupResponse = {
  success: boolean;
  profile?: JurisdictionProfile;
  error?: string;
};

/** A draft incident report for validation. */
export type ReportDraft = {
  title: string;
  summary: string;
  category: IncidentCategory;
  area: string;
  countryCode: string;
  subdivisionCode?: string;
  occurredAt?: string;
  /** Whether the user was a participant in any recording. */
  userIsParticipant?: boolean;
  /** Whether explicit consent was obtained. */
  obtainedExplicitConsent?: boolean;
  /** Whether the incident occurred in a public space. */
  inPublicSpace?: boolean;
};

/** AI validation result for a report draft. */
export type ValidationResult = {
  compliant: boolean;
  missingFields: string[];
  formattingIssues: string[];
  /** The jurisdiction-compliant formatted summary. */
  formattedSummary: string;
  /** Whether the user must explicitly confirm before dispatch. */
  requiresHumanConfirmation: boolean;
  /** The jurisdiction this validation was checked against. */
  governingJurisdiction: string;
  /** Privacy regime applied. */
  privacyRegime: PrivacyRegime;
  /** ISO timestamp. */
  validatedAt: string;
};

/** Request for the validate endpoint. */
export type ValidateRequest = {
  reportDraft: ReportDraft;
  countryCode: string;
  lat?: number;
  lng?: number;
};

/** Response for the validate endpoint. */
export type ValidateResponse = {
  success: boolean;
  validation?: ValidationResult;
  error?: string;
};

/** A confirmed, validated report ready for dispatch. */
export type DispatchRequest = {
  reportDraft: ReportDraft;
  validation: ValidationResult;
  humanConfirmed: boolean;
  /** Channel to dispatch to. */
  channels: DispatchChannel[];
};

export type DispatchChannel =
  | "GOVT_AGENCY"
  | "PRESS"
  | "HUMAN_RIGHTS"
  | "LEGAL_NETWORK";

/** Result of a dispatch operation. */
export type DispatchResult = {
  success: boolean;
  dispatchedTo: {
    agencyId: string;
    agencyName: string;
    channel: DispatchChannel;
    portalUrl: string;
    /** Dispatch is recorded as an audit trail — user completes submission. */
    status: "AUDIT_RECORDED";
  }[];
  auditId: string;
  error?: string;
};

/** Sealed evidence package from the client (zero-knowledge). */
export type SealedEvidencePackage = {
  incidentId: string;
  /** AES-256-GCM sealed payload (client-side, key stays on device). */
  sealedPayload: string;
  /** Media type. */
  mediaType: string;
  /** SHA-256 content hash for integrity. */
  contentHash: string;
  /** Whether metadata was scrubbed client-side. */
  metadataScrubbed: boolean;
};

/** Request to create an incident with sealed evidence. */
export type CreateIncidentRequest = {
  userId: string;
  countryCode: string;
  category: IncidentCategory;
  privacyLevel: "private" | "trusted" | "public";
  reportDraft: ReportDraft;
  validation: ValidationResult;
  sealedEvidence?: SealedEvidencePackage;
  humanConfirmed: boolean;
};

export type CreateIncidentResponse = {
  success: boolean;
  incidentId?: string;
  error?: string;
};
