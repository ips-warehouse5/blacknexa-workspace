import type { IncidentCategory } from "@/mocks/incidents";
import { evaluateMediaCompliance, type MediaUploadContext } from "@/constants/compliance";
import { quickCredibilityAssessment, type CredibilityReport, MERIT_THRESHOLD } from "@/constants/credibility";
import {
  type DispatchChannel,
  CHANNEL_LABELS,
  CHANNEL_DISCLAIMERS,
  hasRequiredAcknowledgments,
  MISSION_STATEMENT,
} from "@/constants/disclaimers";
import { resolveAgencies, verifyAgencyContact, flagAgencyForUpdate, type Agency, type AgencyVerificationResult } from "@/constants/agencies";

/**
 * BlackNexa(TM) Master Dispatch Router
 *
 * Orchestrates the full incident processing pipeline:
 * 1. Enforce mandatory legal & opt-in safeguards (no-guarantee disclaimers)
 * 2. Execute jurisdictional compliance evaluation
 * 3. Perform AI credibility & merit vetting (85%+ threshold)
 * 4. Resolve target agencies geographically (federal, state, international)
 * 5. Verify agency contact integrity (email MX, portal availability)
 * 6. Execute encrypted dispatch with full audit trail
 *
 * All dispatch operations require:
 * - Explicit user opt-in
 * - No-guarantee disclaimer acknowledgment
 * - Compliance check passing
 * - Credibility score >= 85%
 *
 * Trademark pending with the USPTO. BlackNexa(TM) - By the people, for the people.
 */

export type DispatchAcknowledgments = Record<string, boolean>;

export type DispatchResult = {
  status: "SUCCESSFULLY_DISPATCHED" | "NOT_ELIGIBLE" | "COMPLIANCE_BLOCKED" | "CONSENT_REQUIRED" | "NO_AGENCIES_FOUND";
  message: string;
  credibilityScore?: number;
  targetAgencies?: AgencyTarget[];
  channel?: DispatchChannel;
  transmissionAuditId?: string;
  disclaimerApplied: boolean;
  missionStatement: string;
};

export type AgencyTarget = {
  agency: Agency;
  verification: AgencyVerificationResult;
  /** Whether this agency was flagged for contact update. */
  flaggedForUpdate: boolean;
};

export type DispatchParams = {
  incidentId: string;
  category: IncidentCategory;
  countryCode: string;
  subdivisionCode: string;
  hasEvidence: boolean;
  evidenceCount: number;
  verifications: number;
  urgent: boolean;
  hasLocation: boolean;
  /** Target dispatch channel. */
  channel: DispatchChannel;
  /** User explicit opt-in. */
  userExplicitOptIn: boolean;
  /** User acknowledged no-guarantee disclaimer. */
  acknowledgedNoGuarantee: boolean;
  /** All disclaimer acknowledgments. */
  acknowledgments: DispatchAcknowledgments;
  /** Compliance context (if evidence is attached). */
  complianceContext?: MediaUploadContext;
};

/**
 * Execute the full dispatch pipeline for an incident.
 * This is the master orchestrator that enforces all safeguards
 * before any evidence package is transmitted.
 */
export function processIncidentDispatch(params: DispatchParams): DispatchResult {
  // 1. Enforce Mandatory Legal & Opt-in Safeguards
  if (!params.userExplicitOptIn) {
    return {
      status: "CONSENT_REQUIRED",
      message: "Explicit user opt-in is strictly required before dispatch.",
      disclaimerApplied: false,
      missionStatement: MISSION_STATEMENT,
    };
  }

  if (!params.acknowledgedNoGuarantee) {
    return {
      status: "CONSENT_REQUIRED",
      message: "Acknowledgment of the No-Guarantee disclaimer is strictly required before dispatch.",
      disclaimerApplied: false,
      missionStatement: MISSION_STATEMENT,
    };
  }

  // Check all required disclaimers for this channel
  const requiredDisclaimers = CHANNEL_DISCLAIMERS[params.channel];
  const allAcknowledged = requiredDisclaimers.every((d) => params.acknowledgments[d] === true);
  if (!allAcknowledged) {
    return {
      status: "CONSENT_REQUIRED",
      message: `All required disclaimers must be acknowledged for ${CHANNEL_LABELS[params.channel]} dispatch.`,
      disclaimerApplied: false,
      missionStatement: MISSION_STATEMENT,
    };
  }

  // 2. Execute Compliance Evaluation (if evidence present)
  if (params.complianceContext && params.hasEvidence) {
    const complianceCheck = evaluateMediaCompliance(params.complianceContext);
    if (!complianceCheck.isAllowed && complianceCheck.status === "REJECTED") {
      return {
        status: "COMPLIANCE_BLOCKED",
        message: complianceCheck.summary,
        disclaimerApplied: true,
        missionStatement: MISSION_STATEMENT,
      };
    }
  }

  // 3. Perform AI Credibility & Merit Vetting
  const credibilityReport = quickCredibilityAssessment({
    incidentId: params.incidentId,
    hasEvidence: params.hasEvidence,
    evidenceCount: params.evidenceCount,
    verifications: params.verifications,
    urgent: params.urgent,
    hasLocation: params.hasLocation,
  });

  if (!credibilityReport.hasMerit) {
    return {
      status: "NOT_ELIGIBLE",
      message: `Incident did not meet credibility/merit criteria (${Math.round(MERIT_THRESHOLD * 100)}% required). Current score: ${Math.round(credibilityReport.credibilityScore * 100)}%.`,
      credibilityScore: credibilityReport.credibilityScore,
      disclaimerApplied: true,
      missionStatement: MISSION_STATEMENT,
    };
  }

  // 4. Resolve Target Agencies
  const agencies = resolveAgencies({
    category: params.category,
    countryCode: params.countryCode,
    subdivisionCode: params.subdivisionCode,
    channel: params.channel,
  });

  if (agencies.length === 0) {
    return {
      status: "NO_AGENCIES_FOUND",
      message: `No matching agencies found for this category and jurisdiction in the ${CHANNEL_LABELS[params.channel]} channel.`,
      credibilityScore: credibilityReport.credibilityScore,
      disclaimerApplied: true,
      missionStatement: MISSION_STATEMENT,
    };
  }

  // 5. Verify Agency Contact Integrity
  const targets: AgencyTarget[] = agencies.map((agency) => {
    const verification = verifyAgencyContact(agency);
    const flaggedForUpdate = !verification.overallValid;
    if (flaggedForUpdate) {
      flagAgencyForUpdate(agency);
    }
    return { agency, verification, flaggedForUpdate };
  });

  // 6. Execute Encrypted Dispatch (simulated — real dispatch would
  // transmit the sealed evidence package via TLS 1.3)
  const transmissionAuditId = `dispatch_${params.incidentId}_${Date.now().toString(36)}`;

  return {
    status: "SUCCESSFULLY_DISPATCHED",
    message: `Incident package dispatched to ${targets.length} target(s) via ${CHANNEL_LABELS[params.channel]}.`,
    credibilityScore: credibilityReport.credibilityScore,
    targetAgencies: targets,
    channel: params.channel,
    transmissionAuditId,
    disclaimerApplied: true,
    missionStatement: MISSION_STATEMENT,
  };
}

/**
 * Get a preview of the dispatch pipeline without executing it.
 * Useful for showing the user what would happen before they opt in.
 */
export function previewDispatch(params: Omit<DispatchParams, "userExplicitOptIn" | "acknowledgedNoGuarantee" | "acknowledgments">): {
  credibility: CredibilityReport;
  agencies: Agency[];
  requiredDisclaimers: string[];
  estimatedTargets: number;
} {
  const credibility = quickCredibilityAssessment({
    incidentId: params.incidentId,
    hasEvidence: params.hasEvidence,
    evidenceCount: params.evidenceCount,
    verifications: params.verifications,
    urgent: params.urgent,
    hasLocation: params.hasLocation,
  });

  const agencies = resolveAgencies({
    category: params.category,
    countryCode: params.countryCode,
    subdivisionCode: params.subdivisionCode,
    channel: params.channel,
  });

  const requiredDisclaimers = CHANNEL_DISCLAIMERS[params.channel].map(
    (d) => CHANNEL_LABELS[params.channel]
  );

  return {
    credibility,
    agencies,
    requiredDisclaimers,
    estimatedTargets: agencies.length,
  };
}

export { MERIT_THRESHOLD, CHANNEL_LABELS, MISSION_STATEMENT };
export type { CredibilityReport, DispatchChannel, Agency };
