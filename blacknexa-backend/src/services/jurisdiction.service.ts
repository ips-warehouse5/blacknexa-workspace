/**
 * Jurisdiction resolver and compliance validator for the Geo-Legal engine.
 *
 * Resolution order, unchanged from the Worker:
 *   1. Curated database — 19 jurisdictions, instant, no model call.
 *   2. AI lookup for anything not curated, with an explicit instruction to omit
 *      rather than invent. A fabricated agency phone number or statute citation in
 *      a civil-rights reporting tool is worse than a missing one, so the prompt
 *      says so and the caller caches only what comes back whole.
 *
 * Validation follows the same shape: model first, deterministic rule-based
 * fallback second, so the endpoint never fails because the gateway did.
 */

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { fetchWithTimeout, extractJsonObject } from "@/utils/http.util";
import {
  CURATED_COUNTRIES,
  getCuratedProfile,
  listCuratedCountries,
} from "@/data/jurisdictions.data";
import type {
  JurisdictionProfile,
  LegalFramework,
  OversightAgency,
  PressContact,
  PrivacyRegime,
  ReportDraft,
  ValidationResult,
} from "@/types/geo_legal.interface";

const RESOLVER_SYSTEM = `You are the BlackNexa Geo-Legal Engine. Given a country, you produce a precise, factual jurisdiction profile for civil-rights and discrimination reporting.

RULES:
1. Use ONLY verified, real-world information. Do NOT invent agency names, phone numbers, emails, URLs, or statutes. If you are uncertain about a detail, omit it rather than fabricate.
2. Return the primary anti-discrimination / civil-rights legal framework(s) for the country, with exact statute names and citations where known.
3. Return the accredited government oversight agency or human rights commission that handles discrimination complaints in that country. Include the official portal URL and intake contact if known.
4. Return 1-2 verified independent press or investigative media outlets that cover civil rights in that country.
5. Identify the data privacy regime: GDPR, CCPA, PIPEDA, LGPD, POPIA, UK_DPA, APP, PDPA, or GENERAL.
6. Identify the primary language code (BCP-47 short code: en, es, fr, de, etc.).

Output STRICTLY this JSON shape and nothing else:
{
  "countryName": "Full country name",
  "primaryLanguage": "en",
  "privacyRegime": "GDPR",
  "legalFrameworks": [
    {"name":"...","citation":"...","summary":"...","categories":["policing","housing"],"url":"..."}
  ],
  "agencies": [
    {"id":"xx-agency","name":"...","tier":"NATIONAL","portalUrl":"https://...","intakeEmail":"...","phone":"...","categories":["policing","housing"],"description":"..."}
  ],
  "pressContacts": [
    {"id":"xx-press","name":"...","type":"NATIONAL","portalUrl":"https://...","categories":["policing"],"description":"..."}
  ]
}

Valid category values: policing, profiling, housing, workplace, education, medical, harassment.
Valid agency tiers: NATIONAL, REGIONAL, LOCAL, INTERNATIONAL.
Valid press types: INVESTIGATIVE, NATIONAL, REGIONAL, INTERNATIONAL.
Valid privacy regimes: GDPR, CCPA, PIPEDA, LGPD, POPIA, UK_DPA, APP, PDPA, GENERAL.`;

const VALIDATOR_SYSTEM = `You are the BlackNexa Compliance Validation Engine. You review incident reports against the local jurisdiction's legal requirements before external dispatch.

RULES:
1. Check the report against the jurisdiction's legal framework requirements. Identify any mandatory statutory fields that are missing (e.g. date/time of incident, location, parties involved).
2. Check for data disclosure obligations under the jurisdiction's privacy regime (GDPR, CCPA, PIPEDA, LGPD, POPIA, etc.).
3. Identify any formatting issues that would make the report non-compliant (e.g. vague descriptions, missing context, hearsay without corroboration).
4. Produce a jurisdiction-compliant formatted summary — a clean, factual, well-structured version of the report suitable for submission to a government agency or press outlet. Include all mandatory fields in the correct order for this jurisdiction.
5. Do NOT alter the facts. Only reformat and structure. If critical facts are missing, list them in missingFields.
6. The formattedSummary must be in English (the app handles translation separately).

Output STRICTLY this JSON shape and nothing else:
{
  "compliant": true,
  "missingFields": ["..."],
  "formattingIssues": ["..."],
  "formattedSummary": "The full jurisdiction-compliant formatted report...",
  "requiresHumanConfirmation": true
}`;

interface AiJurisdictionResponse {
  countryName: string;
  primaryLanguage: string;
  privacyRegime: PrivacyRegime;
  legalFrameworks: LegalFramework[];
  agencies: OversightAgency[];
  pressContacts: PressContact[];
}

interface AiValidationResponse {
  compliant: boolean;
  missingFields: string[];
  formattingIssues: string[];
  formattedSummary: string;
  requiresHumanConfirmation: boolean;
}

class JurisdictionService {
  /** True when the country is in the curated database. */
  isCurated(countryCode: string): boolean {
    return CURATED_COUNTRIES.has(countryCode.toUpperCase());
  }

  /** All curated country codes — used by the refresh endpoint. */
  listCurated(): string[] {
    return listCuratedCountries();
  }

  /** The curated profile for a country, or `null`. */
  getCurated(countryCode: string): JurisdictionProfile | null {
    return getCuratedProfile(countryCode);
  }

  /**
   * Resolve a country's full profile: curated first, AI second.
   *
   * `lat`/`lng` are accepted for future subdivision-level resolution; the current
   * curated data and prompt are country-level, exactly as before.
   */
  async resolveJurisdiction(
    countryCode: string,
    _lat?: number,
    _lng?: number,
  ): Promise<JurisdictionProfile | null> {
    const code = countryCode.toUpperCase().trim();
    const curated = this.getCurated(code);
    if (curated) return curated;
    return this.resolveViaAi(code);
  }

  private async resolveViaAi(countryCode: string): Promise<JurisdictionProfile | null> {
    if (!env.ai.enabled) return null;

    const userPrompt = `Country code: ${countryCode}

Produce the complete jurisdiction profile for civil-rights and discrimination reporting in this country. Include the primary anti-discrimination laws, the main government oversight agency or human rights commission, and 1-2 verified independent press outlets that cover civil rights there.`;

    const res = await fetchWithTimeout(`${env.ai.toolkitUrl}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.secretKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: RESOLVER_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2500,
      }),
    });
    if (!res) return null;
    if (!res.ok) {
      logger.warn("[geo-legal] resolver non-ok", { status: res.status });
      return null;
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const parsed = extractJsonObject<AiJurisdictionResponse>(
      data?.choices?.[0]?.message?.content ?? "",
      (p) => Boolean(p.countryName && p.legalFrameworks),
    );
    if (!parsed) return null;

    // Flag AI-sourced contacts so the UI can distinguish them from curated ones.
    return {
      countryCode,
      countryName: parsed.countryName,
      primaryLanguage: parsed.primaryLanguage || "en",
      privacyRegime: parsed.privacyRegime || "GENERAL",
      legalFrameworks: parsed.legalFrameworks ?? [],
      agencies: (parsed.agencies ?? []).map((a) => ({ ...a, aiVerified: true })),
      pressContacts: (parsed.pressContacts ?? []).map((p) => ({ ...p, aiVerified: true })),
      source: "ai-generated",
      generatedAt: new Date().toISOString(),
    };
  }

  /** A minimal profile so validation can still run for an unresolvable country. */
  minimalProfile(countryCode: string): JurisdictionProfile {
    return {
      countryCode: countryCode.toUpperCase(),
      countryName: countryCode.toUpperCase(),
      primaryLanguage: "en",
      privacyRegime: "GENERAL",
      legalFrameworks: [],
      agencies: [],
      pressContacts: [],
      source: "curated",
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /** Validate a draft against the jurisdiction, AI first, rules as fallback. */
  async validateReport(
    draft: ReportDraft,
    profile: JurisdictionProfile,
  ): Promise<ValidationResult> {
    const aiResult = await this.validateViaAi(draft, profile);
    if (aiResult) {
      return {
        ...aiResult,
        governingJurisdiction: profile.countryCode,
        privacyRegime: profile.privacyRegime,
        validatedAt: new Date().toISOString(),
      };
    }
    return this.ruleBasedValidation(draft, profile);
  }

  private async validateViaAi(
    draft: ReportDraft,
    profile: JurisdictionProfile,
  ): Promise<AiValidationResponse | null> {
    if (!env.ai.enabled) return null;

    const frameworkNames = profile.legalFrameworks
      .map((f) => `${f.name} (${f.citation})`)
      .join("; ");
    const agencyNames = profile.agencies.map((a) => a.name).join("; ");

    const userPrompt = `JURISDICTION: ${profile.countryName} (${profile.countryCode})
PRIVACY REGIME: ${profile.privacyRegime}
LEGAL FRAMEWORKS: ${frameworkNames || "N/A"}
OVERSIGHT AGENCIES: ${agencyNames || "N/A"}

REPORT DRAFT:
Title: ${draft.title}
Summary: ${draft.summary}
Category: ${draft.category}
Area: ${draft.area}
Occurred: ${draft.occurredAt || "Not specified"}
User was participant: ${draft.userIsParticipant ? "Yes" : "No"}
Explicit consent obtained: ${draft.obtainedExplicitConsent ? "Yes" : "No"}
Public space: ${draft.inPublicSpace ? "Yes" : "No"}

Validate this report against the jurisdiction's requirements and produce the compliant formatted summary.`;

    const res = await fetchWithTimeout(`${env.ai.toolkitUrl}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.secretKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: VALIDATOR_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });
    if (!res) return null;
    if (!res.ok) {
      logger.warn("[geo-legal] validator non-ok", { status: res.status });
      return null;
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    return extractJsonObject<AiValidationResponse>(
      data?.choices?.[0]?.message?.content ?? "",
      (p) => typeof p.compliant === "boolean" && Boolean(p.formattedSummary),
    );
  }

  /** Deterministic fallback validation. */
  private ruleBasedValidation(
    draft: ReportDraft,
    profile: JurisdictionProfile,
  ): ValidationResult {
    const missingFields: string[] = [];
    const formattingIssues: string[] = [];

    if (!draft.title || draft.title.trim().length < 4) {
      missingFields.push("A descriptive title (at least 4 characters)");
    }
    if (!draft.summary || draft.summary.trim().length < 10) {
      missingFields.push("A detailed description of the incident (at least 10 characters)");
    }
    if (!draft.area || draft.area.trim().length === 0) {
      missingFields.push("Location where the incident occurred");
    }
    if (!draft.occurredAt) {
      missingFields.push("Date and time of the incident");
    }

    // Surface the reader's own data rights alongside the report.
    if (profile.privacyRegime === "GDPR" || profile.privacyRegime === "UK_DPA") {
      formattingIssues.push(
        "GDPR notice: This report will be processed under GDPR. The user's data rights include access, rectification, and erasure.",
      );
    } else if (profile.privacyRegime === "CCPA") {
      formattingIssues.push(
        "CCPA notice: This report will be processed under CCPA. The user's data rights include know, delete, and opt-out.",
      );
    }

    return {
      compliant: missingFields.length === 0,
      missingFields,
      formattingIssues,
      formattedSummary: this.formatReport(draft, profile),
      // Always true: nothing is dispatched to an agency or the press without the
      // reporter explicitly confirming it first.
      requiresHumanConfirmation: true,
      governingJurisdiction: profile.countryCode,
      privacyRegime: profile.privacyRegime,
      validatedAt: new Date().toISOString(),
    };
  }

  /** Format a draft into a submission-ready document. */
  formatReport(draft: ReportDraft, profile: JurisdictionProfile): string {
    const lines: string[] = [];
    lines.push(`BLACKNEXA™ — INCIDENT REPORT`);
    lines.push(`Jurisdiction: ${profile.countryName} (${profile.countryCode})`);
    lines.push(`Privacy Regime: ${profile.privacyRegime}`);
    lines.push("");
    lines.push(`Title: ${draft.title}`);
    lines.push(`Category: ${draft.category}`);
    lines.push(`Location: ${draft.area}`);
    lines.push(`Date/Time: ${draft.occurredAt || "Not specified"}`);
    lines.push("");
    lines.push(`Description:`);
    lines.push(draft.summary);
    lines.push("");
    if (profile.legalFrameworks.length > 0) {
      lines.push(`Applicable Legal Framework:`);
      for (const f of profile.legalFrameworks.slice(0, 3)) {
        lines.push(`  • ${f.name} (${f.citation})`);
      }
      lines.push("");
    }
    lines.push(`Recording Context:`);
    lines.push(`  • User was a participant: ${draft.userIsParticipant ? "Yes" : "No"}`);
    lines.push(`  • Explicit consent obtained: ${draft.obtainedExplicitConsent ? "Yes" : "No"}`);
    lines.push(`  • Public space: ${draft.inPublicSpace ? "Yes" : "No"}`);
    lines.push("");
    lines.push(`BlackNexa™ — By the people, for the people.`);
    lines.push(`Trademark pending with the USPTO.`);
    return lines.join("\n");
  }

  /** User-facing label for a privacy regime. */
  privacyRegimeLabel(regime: PrivacyRegime): string {
    const labels: Record<PrivacyRegime, string> = {
      GDPR: "GDPR (EU)",
      CCPA: "CCPA (California)",
      PIPEDA: "PIPEDA (Canada)",
      LGPD: "LGPD (Brazil)",
      POPIA: "POPIA (South Africa)",
      UK_DPA: "UK DPA 2018",
      APP: "Australian Privacy Principles",
      PDPA: "PDPA",
      GENERAL: "General Data Protection",
    };
    return labels[regime] ?? regime;
  }
}

export const jurisdictionService = new JurisdictionService();
export default jurisdictionService;
