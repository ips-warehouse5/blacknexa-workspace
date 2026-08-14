/**
 * BlackNexa™ Jurisdictional & Privacy Compliance Engine
 *
 * Evaluates media uploads against wiretap laws, surveillance regulations,
 * and privacy frameworks before storage. Covers:
 * - US one-party vs all-party consent states (18 U.S.C. § 2511)
 * - EU GDPR Article 6 lawful basis requirements
 * - Canada PIPEDA
 * - Australia state-level surveillance acts
 * - Video expectation-of-privacy safeguards
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

export type ConsentType = "ONE_PARTY" | "ALL_PARTY" | "EXPLICIT_OPT_IN" | "PASSED";

export type ComplianceStatus = "APPROVED" | "PENDING_LEGAL_REVIEW" | "REJECTED";

export type MediaType = "AUDIO" | "VIDEO" | "PHOTO" | "DOCUMENT";

export type MediaUploadContext = {
  incidentId: string;
  userId: string;
  mediaType: MediaType;
  /** ISO-2 country code, e.g. "US", "DE", "CA", "AU", "GB". */
  countryCode: string;
  /** State / province subdivision code, e.g. "CA", "NY", "ON". */
  subdivisionCode: string;
  isAnonymous: boolean;
  redactExactLocation: boolean;
  autoSealEnabled: boolean;
  /** Whether the user is a participant in the recorded conversation. */
  userIsParticipant: boolean;
  /** Whether explicit consent was obtained from all parties. */
  obtainedExplicitConsent: boolean;
  /** Whether the recording took place in a public space. */
  inPublicSpace: boolean;
  /** Whether the user agreed to the data processing terms (GDPR Art. 6). */
  dataProcessingAgreed: boolean;
};

export type ComplianceResult = {
  isAllowed: boolean;
  status: ComplianceStatus;
  governingJurisdiction: string;
  requiredConsentType: ConsentType;
  reasons: string[];
  /** Short human-readable summary for UI display. */
  summary: string;
};

/** US states requiring all-party consent for recordings. */
const US_ALL_PARTY_STATES = new Set([
  "CA", "CT", "DE", "FL", "IL", "MD", "MA", "MT", "NV", "NH", "PA", "WA",
]);

/** Australian states/territories with all-party consent. */
const AUS_ALL_PARTY_STATES = new Set(["NSW", "SA", "WA", "TAS", "ACT"]);

/** EU/EEA countries with strict GDPR enforcement on recordings. */
export const STRICT_EU_COUNTRIES = new Set([
  "DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "SE", "PL", "PT", "FI", "DK", "NO", "IS", "LU", "CZ", "RO", "GR",
]);

/** Canada — PIPEDA applies federally, Quebec has stricter private-sector law. */
const CANADA_STRICT_PROVINCES = new Set(["QC"]);

/**
 * Evaluate whether a media upload is compliant with the governing
 * jurisdiction's wiretap, surveillance, and privacy laws.
 */
export function evaluateMediaCompliance(ctx: MediaUploadContext): ComplianceResult {
  const reasons: string[] = [];
  const country = ctx.countryCode.toUpperCase();
  const subdiv = ctx.subdivisionCode.toUpperCase();
  const mediaType = ctx.mediaType.toUpperCase();

  // ── 1. Video Expectation of Privacy Safeguard ────────────────────────
  if (mediaType === "VIDEO") {
    if (!ctx.inPublicSpace && !ctx.obtainedExplicitConsent && !ctx.userIsParticipant) {
      reasons.push(
        "SAFEGUARD TRIGGERED: Recording video in a non-public area without consent violates reasonable expectation of privacy laws."
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: `${country}-${subdiv}`,
        requiredConsentType: "EXPLICIT_OPT_IN",
        reasons,
        summary:
          "Recording video in a private space without consent is prohibited. Obtain explicit consent from all parties first.",
      };
    }
  }

  // ── 2. EU / UK — GDPR ────────────────────────────────────────────────
  if (STRICT_EU_COUNTRIES.has(country) || country === "GB") {
    if (!ctx.dataProcessingAgreed) {
      reasons.push(
        "SAFEGUARD TRIGGERED: Missing explicit GDPR Article 6 data processing agreement."
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: country,
        requiredConsentType: "EXPLICIT_OPT_IN",
        reasons,
        summary:
          "GDPR requires explicit data processing consent before storing this media in EU/UK jurisdictions.",
      };
    }
    if (!ctx.obtainedExplicitConsent && !ctx.inPublicSpace) {
      reasons.push(
        "SAFEGUARD TRIGGERED: Recording without explicit participant consent in non-public space violates GDPR privacy rules."
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: country,
        requiredConsentType: "EXPLICIT_OPT_IN",
        reasons,
        summary:
          "Under GDPR, recording in a non-public space requires explicit consent from all participants.",
      };
    }
    reasons.push(`Compliance cleared under GDPR (${country}) legal framework.`);
    return {
      isAllowed: true,
      status: "APPROVED",
      governingJurisdiction: country,
      requiredConsentType: "PASSED",
      reasons,
      summary: `Approved under GDPR. Consent verified for ${country}.`,
    };
  }

  // ── 3. Canada — PIPEDA ───────────────────────────────────────────────
  if (country === "CA") {
    const isStrict = CANADA_STRICT_PROVINCES.has(subdiv);
    if (isStrict && !ctx.obtainedExplicitConsent && !ctx.inPublicSpace) {
      reasons.push(
        `SAFEGUARD TRIGGERED: Province of CA-${subdiv} enforces stricter consent under Quebec Law 25.`
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: `CA-${subdiv}`,
        requiredConsentType: "EXPLICIT_OPT_IN",
        reasons,
        summary: `Quebec Law 25 requires explicit consent for recordings in private spaces.`,
      };
    }
    if (!ctx.userIsParticipant && !ctx.inPublicSpace) {
      reasons.push(
        "SAFEGUARD TRIGGERED: Third-party recording without participation prohibited under PIPEDA."
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: `CA-${subdiv}`,
        requiredConsentType: "ALL_PARTY",
        reasons,
        summary: "PIPEDA prohibits third-party recording without participation in private spaces.",
      };
    }
    reasons.push(`Compliance cleared under PIPEDA (CA-${subdiv}) framework.`);
    return {
      isAllowed: true,
      status: "APPROVED",
      governingJurisdiction: `CA-${subdiv}`,
      requiredConsentType: "PASSED",
      reasons,
      summary: `Approved under PIPEDA. Consent verified for CA-${subdiv}.`,
    };
  }

  // ── 4. Australia — Surveillance Acts ─────────────────────────────────
  if (country === "AU") {
    const isAllParty = AUS_ALL_PARTY_STATES.has(subdiv);
    if (isAllParty && !ctx.obtainedExplicitConsent && !ctx.inPublicSpace) {
      reasons.push(
        `SAFEGUARD TRIGGERED: AU-${subdiv} enforces all-party consent under state surveillance devices act.`
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: `AU-${subdiv}`,
        requiredConsentType: "ALL_PARTY",
        reasons,
        summary: `AU-${subdiv} requires all-party consent for private recordings.`,
      };
    }
    if (!ctx.userIsParticipant && !ctx.inPublicSpace) {
      reasons.push(
        "SAFEGUARD TRIGGERED: Eavesdropping prohibited under federal Surveillance Devices Act 2004."
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: `AU-${subdiv}`,
        requiredConsentType: "ALL_PARTY",
        reasons,
        summary: "Australian law prohibits third-party recording without participation.",
      };
    }
    reasons.push(`Compliance cleared under AU-${subdiv} surveillance framework.`);
    return {
      isAllowed: true,
      status: "APPROVED",
      governingJurisdiction: `AU-${subdiv}`,
      requiredConsentType: "PASSED",
      reasons,
      summary: `Approved under Australian surveillance law. Consent verified for AU-${subdiv}.`,
    };
  }

  // ── 5. United States — Wiretap Act & State Laws ──────────────────────
  if (country === "US") {
    const isAllParty = US_ALL_PARTY_STATES.has(subdiv);
    const reqConsent: ConsentType = isAllParty ? "ALL_PARTY" : "ONE_PARTY";

    // Third-party eavesdropping
    if (!ctx.userIsParticipant && !ctx.inPublicSpace) {
      reasons.push(
        "SAFEGUARD TRIGGERED: Eavesdropping/third-party recording prohibited under federal/state wiretap statutes (18 U.S.C. § 2511)."
      );
      return {
        isAllowed: false,
        status: "REJECTED",
        governingJurisdiction: `US-${subdiv}`,
        requiredConsentType: reqConsent,
        reasons,
        summary: "Federal wiretap law prohibits third-party recording without participation.",
      };
    }

    // All-party consent states
    if (isAllParty && !ctx.obtainedExplicitConsent && !ctx.inPublicSpace) {
      reasons.push(
        `SAFEGUARD TRIGGERED: State of US-${subdiv} strictly enforces All-Party Consent.`
      );
      return {
        isAllowed: false,
        status: "PENDING_LEGAL_REVIEW",
        governingJurisdiction: `US-${subdiv}`,
        requiredConsentType: reqConsent,
        reasons,
        summary: `US-${subdiv} is an all-party consent state. Obtain consent from all parties or record in a public space.`,
      };
    }

    reasons.push(`Compliance cleared under US-${subdiv} legal framework (${reqConsent}).`);
    return {
      isAllowed: true,
      status: "APPROVED",
      governingJurisdiction: `US-${subdiv}`,
      requiredConsentType: "PASSED",
      reasons,
      summary: `Approved under ${isAllParty ? "all-party" : "one-party"} consent law (US-${subdiv}).`,
    };
  }

  // ── 6. Fallback — pending legal review for unknown jurisdictions ─────
  reasons.push(
    `SAFEGUARD TRIGGERED: Jurisdiction ${country}-${subdiv} not in compliance database. Flagged for manual legal review.`
  );
  return {
    isAllowed: false,
    status: "PENDING_LEGAL_REVIEW",
    governingJurisdiction: `${country}-${subdiv}`,
    requiredConsentType: "EXPLICIT_OPT_IN",
    reasons,
    summary: `Jurisdiction ${country}-${subdiv} requires manual legal review before storage.`,
  };
}

// ── Convenience: US state recording law reference ──────────────────────

export type StateConsentRule = {
  state: string;
  consentType: ConsentType;
  note: string;
};

/** Quick-lookup for US state consent rules (subset shown in Support tab). */
export const US_STATE_CONSENT_RULES: StateConsentRule[] = [
  { state: "CA", consentType: "ALL_PARTY", note: "California — all-party consent (Penal Code § 632)" },
  { state: "NY", consentType: "ONE_PARTY", note: "New York — one-party consent" },
  { state: "TX", consentType: "ONE_PARTY", note: "Texas — one-party consent" },
  { state: "FL", consentType: "ALL_PARTY", note: "Florida — all-party consent" },
  { state: "IL", consentType: "ALL_PARTY", note: "Illinois — all-party consent" },
  { state: "GA", consentType: "ONE_PARTY", note: "Georgia — one-party consent" },
  { state: "PA", consentType: "ALL_PARTY", note: "Pennsylvania — all-party consent" },
  { state: "MA", consentType: "ALL_PARTY", note: "Massachusetts — all-party consent" },
  { state: "WA", consentType: "ALL_PARTY", note: "Washington — all-party consent" },
  { state: "NV", consentType: "ALL_PARTY", note: "Nevada — all-party consent" },
];

export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  ONE_PARTY: "One-Party Consent",
  ALL_PARTY: "All-Party Consent",
  EXPLICIT_OPT_IN: "Explicit Opt-In Required",
  PASSED: "Compliance Verified",
};
