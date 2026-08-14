/**
 * BlackNexa(TM) Mandatory Legal & Media Disclaimers
 *
 * Enforces user consent and "No-Guarantee" disclaimers acknowledging
 * that lawyers, media, and agencies act independently and are not
 * guaranteed to accept cases or publish stories.
 *
 * All dispatch operations require explicit opt-in AND no-guarantee
 * acknowledgment before any evidence package is transmitted.
 *
 * Trademark pending with the USPTO. BlackNexa(TM) - By the people, for the people.
 */

export type DisclaimerType = "no_guarantee" | "legal_scope" | "media_consent" | "agency_consent";

export type Disclaimer = {
  id: DisclaimerType;
  title: string;
  body: string;
  /** Whether the user must explicitly acknowledge this before dispatch. */
  requiresAcknowledgment: boolean;
};

export const DISCLAIMERS: Record<DisclaimerType, Disclaimer> = {
  no_guarantee: {
    id: "no_guarantee",
    title: "No-Guarantee Policy",
    requiresAcknowledgment: true,
    body: [
      "BLACKNEXA(TM) PLATFORM SCOPE & NO-GUARANTEE POLICY:",
      "",
      "1. BlackNexa(TM) is an independent technology platform and evidence vault, NOT a law firm, lawyer referral service, or news publisher.",
      "",
      "2. NO GUARANTEE OF LEGAL REPRESENTATION: Submitting incident reports to legal networks or advocacy groups DOES NOT create an attorney-client relationship and DOES NOT guarantee that any attorney or firm will accept your case.",
      "",
      "3. NO GUARANTEE OF PRESS PUBLICATION: Forwarding verified incident reports to local, national, or international media outlets DOES NOT guarantee that journalists or news networks will investigate or publish your story.",
      "",
      "4. NO GUARANTEE OF GOVERNMENTAL ACTION: Routing evidence to federal (HUD, EEOC, DOJ), state, or international oversight agencies does not guarantee government investigation or legal intervention. All third-party organizations make decisions at their sole, independent discretion.",
    ].join("\n"),
  },
  legal_scope: {
    id: "legal_scope",
    title: "Legal Scope & Disclaimer",
    requiresAcknowledgment: true,
    body: [
      "BlackNexa(TM) is not a law firm and does not provide legal advice.",
      "",
      "The platform provides tools for documentation, evidence vaulting, and routing to legal resources. Any routing to legal networks does not constitute legal representation or a guarantee of legal services.",
      "",
      "You should seek qualified legal counsel for your specific situation. All attorney-client relationships, if any, are formed directly between you and the attorney, independent of BlackNexa(TM).",
    ].join("\n"),
  },
  media_consent: {
    id: "media_consent",
    title: "Media Disclosure Consent",
    requiresAcknowledgment: true,
    body: [
      "By opting in to media dispatch, you authorize BlackNexa(TM) to forward your verified incident report to journalists and news organizations.",
      "",
      "You understand that:",
      "- Media outlets have independent editorial discretion.",
      "- Publication is never guaranteed.",
      "- Your identity may be revealed to journalists (unless you have selected anonymous reporting).",
      "- You may withdraw media consent at any time, though already-published stories cannot be retracted through this platform.",
    ].join("\n"),
  },
  agency_consent: {
    id: "agency_consent",
    title: "Agency Dispatch Consent",
    requiresAcknowledgment: true,
    body: [
      "By opting in to agency dispatch, you authorize BlackNexa(TM) to route your encrypted evidence package to relevant government agencies (HUD, EEOC, DOJ, CFPB, State AGs, Civil Rights Commissions) and international oversight bodies.",
      "",
      "You understand that:",
      "- Agencies have independent investigative discretion.",
      "- Government action or intervention is never guaranteed.",
      "- Your submitted evidence becomes part of the agency's records, subject to their data retention policies.",
      "- You may be contacted by the agency for follow-up.",
    ].join("\n"),
  },
};

/** The full no-guarantee disclaimer text for display. */
export const NO_GUARANTEE_DISCLAIMER_TEXT = DISCLAIMERS.no_guarantee.body;

/**
 * Mission statement appended to all dispatch confirmations.
 */
export const MISSION_STATEMENT =
  "Dispatched via BlackNexa(TM). Dedicated to truth, accountability, equality, and dignity for all people under God.";

/**
 * Check whether the user has acknowledged all required disclaimers
 * for a given dispatch channel.
 */
export function hasRequiredAcknowledgments(
  acknowledged: Record<DisclaimerType, boolean>,
  channel: DispatchChannel
): boolean {
  if (!acknowledged.no_guarantee) return false;
  if (channel === "PRESS" && !acknowledged.media_consent) return false;
  if (channel === "GOVT_AGENCY" && !acknowledged.agency_consent) return false;
  if (channel === "GLOBAL_HUMAN_RIGHTS" && !acknowledged.agency_consent) return false;
  if (channel === "LEGAL_NETWORK" && !acknowledged.legal_scope) return false;
  return true;
}

/** Channels available for dispatch. */
export type DispatchChannel = "PRESS" | "GOVT_AGENCY" | "GLOBAL_HUMAN_RIGHTS" | "LEGAL_NETWORK";

export const CHANNEL_LABELS: Record<DispatchChannel, string> = {
  PRESS: "Press & Media",
  GOVT_AGENCY: "Government Agency",
  GLOBAL_HUMAN_RIGHTS: "International Human Rights",
  LEGAL_NETWORK: "Legal Network",
};

/** Required disclaimers per channel. */
export const CHANNEL_DISCLAIMERS: Record<DispatchChannel, DisclaimerType[]> = {
  PRESS: ["no_guarantee", "media_consent"],
  GOVT_AGENCY: ["no_guarantee", "agency_consent"],
  GLOBAL_HUMAN_RIGHTS: ["no_guarantee", "agency_consent"],
  LEGAL_NETWORK: ["no_guarantee", "legal_scope"],
};
