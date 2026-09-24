/**
 * The Incident Lifecycle, as steps the detail page can draw.
 *
 * The prototype synthesised three steps from the incident's current state
 * ("Incident Submitted", "Case Assignment & Review", a final decision) and
 * invented the actors and times it could not know. The API now returns the
 * real history (`IncidentDetail.timeline`, contract §3.4): case-status events,
 * publication decisions and assignment changes, each with the actor's name and
 * the time it happened. This module keeps the prototype's visual language —
 * a dot per step, a coloured badge, "time · by", a line of detail — and fills
 * it from that history instead.
 *
 * Tones describe what a step *did*, not how long ago: a dismissal is red and a
 * verification green wherever they fall. The one synthetic step is the
 * prototype's trailing "Verification Decision · Awaiting action", kept because
 * it tells an operator the case is theirs to decide — and replaced by
 * "Publication decision" when the case is waiting on Content Moderation.
 *
 * Pure and free of React so the mapping reads as a table, and so the component
 * module exports only its component (fast refresh).
 */

import { formatDateTime } from "@/features/incidents/incidents.format";
import {
  REPORT_STATUS_LABELS,
  type IncidentDetail,
  type IncidentTimelineItem,
  type ReportStatus,
} from "@/features/incidents/incidents.types";

/** Colour family of a step's dot, line and badge. */
export type StepTone = "success" | "progress" | "danger" | "muted" | "info" | "pending";

export interface LifecycleDetail {
  text: string;
  /** Who else sees this line: the author on their timeline, or operators only. */
  visibility: "author" | "internal" | null;
}

export interface LifecycleStep {
  id: string;
  title: string;
  badge: string;
  tone: StepTone;
  time: string;
  by: string;
  details: LifecycleDetail[];
}

/** The prototype's palette for each tone. */
export const STEP_COLOURS: Record<StepTone, { dot: string; line: string; badge: string; icon: string }> = {
  success: { dot: "#10b981", line: "#86efac", badge: "#059669", icon: "✓" },
  progress: { dot: "#d97706", line: "#fde68a", badge: "#d97706", icon: "•" },
  danger: { dot: "#dc2626", line: "var(--line)", badge: "#dc2626", icon: "✕" },
  muted: { dot: "#6b7280", line: "var(--line)", badge: "#6b7280", icon: "⊘" },
  info: { dot: "#3b82f6", line: "#bfdbfe", badge: "#2563eb", icon: "•" },
  pending: { dot: "#d1d5db", line: "var(--line)", badge: "#9ca3af", icon: "○" },
};

const STATUS_TONES: Record<ReportStatus, StepTone> = {
  draft: "pending",
  submitted: "success",
  under_review: "progress",
  verified: "success",
  dismissed: "danger",
};

/** Publication and file decisions, by what they did. */
const ACTION_TONES: Record<string, StepTone> = {
  "moderation.auto_approve": "success",
  "moderation.approve": "success",
  "moderation.keep": "success",
  "evidence.approve": "success",
  "moderation.hold": "progress",
  "moderation.auto_hide": "progress",
  "moderation.rerun": "progress",
  "moderation.reject": "danger",
  "evidence.reject": "danger",
  "report.delete": "danger",
  "moderation.supersede": "muted",
  "moderation.withdraw": "muted",
  "incident.deactivate": "muted",
  "report.edit": "info",
  "report.resubmit": "info",
};

function toneFor(item: IncidentTimelineItem): StepTone {
  if (item.kind === "status") return item.status ? STATUS_TONES[item.status] : "info";
  if (item.kind === "assignment") return "info";
  if (item.action === "incident.reactivate") {
    return item.moderationState?.after === "approved" ? "success" : "progress";
  }
  return ACTION_TONES[item.action] ?? "info";
}

function badgeFor(item: IncidentTimelineItem): string {
  switch (item.kind) {
    case "status":
      return item.status ? REPORT_STATUS_LABELS[item.status] : "Status";
    case "assignment":
      return "Assignment";
    case "author":
      return "Author";
    case "moderation":
    default:
      if (item.action === "incident.deactivate") return "Deactivated";
      if (item.action === "incident.reactivate") return "Reactivated";
      if (item.action.startsWith("evidence.")) return "Evidence";
      return "Moderation";
  }
}

/**
 * Who acted. Operators by name, members as "Author", the pipeline as "AI check"
 * or "System" — the server names them (contract §3.4). An operator whose
 * account has since gone arrives without a name.
 */
function byFor(item: IncidentTimelineItem): string {
  if (item.actor.name) return item.actor.name;
  return item.actor.kind === "admin" ? "Former team member" : "System";
}

function detailsFor(item: IncidentTimelineItem): LifecycleDetail[] {
  const details: LifecycleDetail[] = [];
  // Reject, dismiss and deactivate reasons are the labels the author was shown.
  if (item.reasonLabel) details.push({ text: `Reason: ${item.reasonLabel}`, visibility: null });
  if (item.note) details.push({ text: item.note, visibility: item.noteVisibility });
  return details;
}

/** The history, oldest first, plus the trailing step when a decision is still owed. */
export function lifecycleSteps(detail: Pick<IncidentDetail, "timeline" | "actions">): LifecycleStep[] {
  const steps: LifecycleStep[] = detail.timeline.map((item) => ({
    id: item.id,
    title: item.label,
    badge: badgeFor(item),
    tone: toneFor(item),
    time: formatDateTime(item.at),
    by: byFor(item),
    details: detailsFor(item),
  }));

  if (detail.actions.verify) {
    steps.push({
      id: "pending-verification",
      title: "Verification Decision",
      badge: "Pending",
      tone: "pending",
      time: "Awaiting action",
      by: "Pending moderator decision",
      details: [{ text: "Mark Verified, Dismiss, or Deactivate.", visibility: null }],
    });
  } else if (detail.actions.resolveModerationFirst) {
    steps.push({
      id: "pending-publication",
      title: "Publication Decision",
      badge: "Pending",
      tone: "pending",
      time: "Awaiting moderation",
      by: "Content Moderation",
      details: [
        { text: "Case decisions open once the incident is published.", visibility: null },
      ],
    });
  }

  return steps;
}

/**
 * The most recent event of one kind — the Case Record's "dismissed by / at /
 * reason", and who deactivated it. The timeline is oldest first, so the last
 * match is the current one (a case can be dismissed, reopened and dismissed
 * again).
 */
export function latestEvent(
  timeline: readonly IncidentTimelineItem[],
  action: string,
): IncidentTimelineItem | null {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const item = timeline[i];
    if (item && item.action === action) return item;
  }
  return null;
}
