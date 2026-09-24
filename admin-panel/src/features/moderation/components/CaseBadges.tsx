/**
 * The small markers a case wears in the queue and on its detail page.
 *
 * **Flag By** is one badge per source, not one badge per case. The prototype
 * picked a single winner ("AI" or "User") and the two builds disagreed about
 * which one won; the real pipeline has four independent sources (§4.4 —
 * `ai_flagged`, `keyword_flagged`, `user_flag_count`, `media_review`) and a
 * case raised by a keyword *and* by three members is exactly the one a
 * moderator should see both reasons for.
 *
 * **SAFETY** sits beside URGENT because it outranks it (D21): a self-harm or
 * imminent-danger signal is top priority whatever the author ticked.
 */

import { Badge } from "@/components/ui/Badge";
import {
  CASE_RESOLUTION_LABELS,
  CASE_RESOLUTION_TONES,
  SAFETY_RISK_LABELS,
  TARGET_STATE_TONES,
  hasSafetyRisk,
  targetStateLabel,
  type CaseResolution,
  type CaseSources,
  type ModerationTargetType,
  type SafetyRisk,
  type TargetModerationState,
} from "@/features/moderation/moderation.types";

/** Badge class and label per source. Keyword uses the accent chip; media the "awaiting" tone. */
const SOURCE_BADGES: readonly { key: keyof CaseSources; label: string; className: string }[] = [
  { key: "ai", label: "AI", className: "badge flag-badge flag-ai" },
  { key: "keyword", label: "Keyword", className: "badge flag-badge flag-source-badge" },
  { key: "user", label: "User", className: "badge flag-badge flag-user" },
  { key: "media", label: "Media", className: "badge flag-badge pending" },
];

export function FlagByBadges({
  sources,
  prefix = false,
}: {
  sources: CaseSources;
  /** Prefix each badge with "Flag By:", as the detail page's top bar does. */
  prefix?: boolean;
}) {
  const active = SOURCE_BADGES.filter((badge) => sources[badge.key]);

  if (active.length === 0) {
    // Held by the pipeline itself — an AI outage, a resubmission, a banned
    // author — with no flagging signal. Saying so beats an empty cell.
    return (
      <span className="badge flag-badge draft" title="Held by the automated check without a flag">
        {prefix ? "Flag By: System" : "System"}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {active.map((badge) => (
        <span key={badge.key} className={badge.className}>
          {prefix ? `Flag By: ${badge.label}` : badge.label}
        </span>
      ))}
    </span>
  );
}

/** The target's publication state, in the target's own vocabulary. */
export function TargetStateBadge({
  targetType,
  state,
}: {
  targetType: ModerationTargetType;
  state: TargetModerationState;
}) {
  return <Badge tone={TARGET_STATE_TONES[state]}>{targetStateLabel(targetType, state)}</Badge>;
}

/** How a resolved case ended. */
export function ResolutionBadge({ resolution }: { resolution: CaseResolution }) {
  return (
    <Badge tone={CASE_RESOLUTION_TONES[resolution]}>{CASE_RESOLUTION_LABELS[resolution]}</Badge>
  );
}

/**
 * URGENT and SAFETY pills.
 *
 * SAFETY reuses the URGENT pill's shape and recolours it with the danger token,
 * mixed rather than hard-coded, so it reads correctly in both themes.
 */
export function RiskPills({
  urgent,
  safetyRisk,
}: {
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
}) {
  return (
    <>
      {hasSafetyRisk(safetyRisk) ? (
        <span
          className="urgent"
          title={`Safety risk: ${SAFETY_RISK_LABELS[safetyRisk]}`}
          style={{
            color: "var(--danger)",
            background: "color-mix(in srgb, var(--danger) 12%, transparent)",
          }}
        >
          SAFETY
        </span>
      ) : null}
      {urgent ? <span className="urgent">URGENT</span> : null}
    </>
  );
}
