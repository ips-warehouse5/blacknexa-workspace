import type { IncidentCategory } from "@/mocks/incidents";

/**
 * Advocacy routing engine.
 *
 * Maps an incident's category + urgency to one or more target
 * organizations and the action BlackNexa(TM) should take on the
 * reporter's behalf. Mirrors the advocacy_mapping payload used by
 * the verification team.
 *
 * Trademark pending with the USPTO. BlackNexa(TM) - By the people,
 * for the people.
 */

export type AdvocacyAction =
  | "FORWARD_FOR_LEGAL_REVIEW"
  | "SEND_CRISIS_ALERT"
  | "INITIATE_CALL_TICKET"
  | "OFFER_KNOW_YOUR_RIGHTS"
  | "CONNECT_TO_VAULT_REVIEW";

export type AdvocacyRoute = {
  /** Stable identifier for the route. */
  id: string;
  /** Trigger tag surfaced to the user (matches verification payload). */
  triggerTag: string;
  /** Human-readable label for the action. */
  actionLabel: string;
  /** Machine action. */
  action: AdvocacyAction;
  /** Target organization name. */
  targetOrg: string;
  /** Optional contact string (phone/url) the user can tap. */
  contact?: string;
  /** Short rationale shown to the user. */
  rationale: string;
};

type IncidentSignal = {
  category?: IncidentCategory;
  urgent?: boolean;
  hasEvidence?: boolean;
};

/** Category -> primary routing rules. */
const CATEGORY_ROUTES: Record<
  IncidentCategory,
  Omit<AdvocacyRoute, "id" | "triggerTag">
> = {
  profiling: {
    actionLabel: "Forward for legal review",
    action: "FORWARD_FOR_LEGAL_REVIEW",
    targetOrg: "National Immigration Law Center",
    contact: "nilc.org",
    rationale:
      "Racial profiling cases are routed to civil rights counsel for review.",
  },
  policing: {
    actionLabel: "Send crisis alert",
    action: "SEND_CRISIS_ALERT",
    targetOrg: "BlackLine",
    contact: "1-800-604-5841",
    rationale:
      "Police encounters are escalated to a peer-support crisis line.",
  },
  housing: {
    actionLabel: "Forward for legal review",
    action: "FORWARD_FOR_LEGAL_REVIEW",
    targetOrg: "National Fair Housing Alliance",
    contact: "nationalfairhousing.org",
    rationale: "Housing discrimination is routed to fair housing advocates.",
  },
  workplace: {
    actionLabel: "Initiate call ticket",
    action: "INITIATE_CALL_TICKET",
    targetOrg: "EEOC Discrimination Hotline",
    contact: "1-800-669-4000",
    rationale: "Workplace reports open a guided EEOC filing ticket.",
  },
  education: {
    actionLabel: "Forward for legal review",
    action: "FORWARD_FOR_LEGAL_REVIEW",
    targetOrg: "Advancement Project",
    contact: "advancementproject.org",
    rationale:
      "School discipline and education equity reports go to education advocates.",
  },
  medical: {
    actionLabel: "Send crisis alert",
    action: "SEND_CRISIS_ALERT",
    targetOrg: "BlackLine",
    contact: "1-800-604-5841",
    rationale:
      "Medical harm reports trigger a crisis alert and patient-advocate referral.",
  },
  harassment: {
    actionLabel: "Initiate call ticket",
    action: "INITIATE_CALL_TICKET",
    targetOrg: "RAINN - Sexual Assault Hotline",
    contact: "1-800-656-4673",
    rationale: "Harassment reports open a confidential support call ticket.",
  },
};

/** Urgent incidents always add a crisis alert on top of the category route. */
const URGENT_OVERRIDE: Omit<AdvocacyRoute, "id" | "triggerTag"> = {
  actionLabel: "Send crisis alert",
  action: "SEND_CRISIS_ALERT",
  targetOrg: "BlackLine",
  contact: "1-800-604-5841",
  rationale:
    "Urgent incidents are flagged for immediate crisis support regardless of category.",
};

const CATEGORY_TAG: Record<IncidentCategory, string> = {
  profiling: "PROFILING",
  policing: "POLICING",
  housing: "HOUSING",
  workplace: "WORKPLACE",
  education: "EDUCATION",
  medical: "MEDICAL",
  harassment: "HARASSMENT",
};

/**
 * Resolve the advocacy routes for an incident.
 * Urgent incidents always receive a crisis alert; the category route
 * is appended unless it duplicates the crisis alert.
 */
export function resolveAdvocacyRoutes(signal: IncidentSignal): AdvocacyRoute[] {
  const routes: AdvocacyRoute[] = [];
  const category = signal.category;

  if (signal.urgent) {
    routes.push({
      id: "route-urgent",
      triggerTag: "URGENT",
      ...URGENT_OVERRIDE,
    });
  }

  if (category) {
    const base = CATEGORY_ROUTES[category];
    const duplicatesUrgent =
      signal.urgent &&
      base.action === URGENT_OVERRIDE.action &&
      base.targetOrg === URGENT_OVERRIDE.targetOrg;

    if (!duplicatesUrgent) {
      routes.push({
        id: `route-${category}`,
        triggerTag: CATEGORY_TAG[category],
        ...base,
      });
    }
  }

  if (signal.hasEvidence) {
    routes.push({
      id: "route-evidence",
      triggerTag: "EVIDENCE",
      actionLabel: "Connect to vault review",
      action: "CONNECT_TO_VAULT_REVIEW",
      targetOrg: "BlackNexa Verification Team",
      rationale:
        "Sealed evidence is queued for verified advocates to review with your consent.",
    });
  }

  return routes;
}

export const ADVOCACY_ACTION_META: Record<
  AdvocacyAction,
  { label: string; tone: "gold" | "crimson" | "emerald" | "sky" }
> = {
  FORWARD_FOR_LEGAL_REVIEW: { label: "Legal review", tone: "gold" },
  SEND_CRISIS_ALERT: { label: "Crisis alert", tone: "crimson" },
  INITIATE_CALL_TICKET: { label: "Call ticket", tone: "sky" },
  OFFER_KNOW_YOUR_RIGHTS: { label: "Know your rights", tone: "emerald" },
  CONNECT_TO_VAULT_REVIEW: { label: "Vault review", tone: "emerald" },
};
