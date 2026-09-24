/**
 * Display formatting for the moderation screens: dates, percentages, initials,
 * and the wording of the case history.
 *
 * Kept out of the page modules so they export components only (fast refresh),
 * and so the queue, the detail and the dialogs print a timestamp the same way.
 * Every function here tolerates a value the API did not send — a moderator
 * looking at a half-migrated legacy row should see "—", not a blank screen.
 */

import { format } from "date-fns";

import {
  BAN_REASON_LABELS,
  DEACTIVATE_REASON_LABELS,
  DISMISS_REASON_LABELS,
  HOLD_REASON_LABELS,
  REJECT_REASON_LABELS,
  targetStateLabel,
  type HistoryItem,
  type ModerationTargetType,
  type TargetModerationState,
} from "@/features/moderation/moderation.types";

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Aug 27, 2026 · 09:41 AM" */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "MMM d, yyyy · hh:mm a") : "—";
}

/** "Aug 27, 2026" */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "MMM d, yyyy") : "—";
}

/** "09:41 AM" */
export function formatTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "hh:mm a") : "";
}

/** "Mar 2025" — account age at a glance, for "member since". */
export function formatMonthYear(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "MMM yyyy") : "—";
}

/** 0.834 → "83%". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

/** 1840 → "1.8 s". */
export function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Initials for an avatar: "Mark Vance" → "MV". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

// ── Case history ────────────────────────────────────────────────────────────

/**
 * How each audit action reads on the timeline.
 *
 * Written as what happened to the content, from the moderator's side. An
 * action the console does not know yet (the server adds one) falls back to its
 * code rather than disappearing, because a gap in an audit trail reads as
 * something hidden.
 */
const HISTORY_ACTION_LABELS: Record<string, string> = {
  "moderation.auto_approve": "Published by the automated check",
  "moderation.hold": "Held for a moderator",
  "moderation.auto_hide": "Hidden automatically after member flags",
  "moderation.keep": "Kept after an automated re-check",
  "moderation.cancel": "Automated check cancelled",
  "moderation.approve": "Approved by a moderator",
  "moderation.reject": "Rejected by a moderator",
  "moderation.rerun": "Sent back through the AI check",
  "moderation.withdraw": "Case closed — the author removed it",
  "moderation.supersede": "Case closed — the incident was deactivated",
  "evidence.approve": "File approved for members",
  "evidence.reject": "File hidden from members",
  "keyword_rule.create": "Keyword rule created",
  "keyword_rule.update": "Keyword rule changed",
  "keyword_rule.delete": "Keyword rule removed",
  "member.ban": "Author banned",
  "member.unban": "Author's ban lifted",
  "incident.verify": "Incident verified",
  "incident.dismiss": "Incident dismissed",
  "incident.reopen": "Incident reopened",
  "incident.deactivate": "Incident deactivated",
  "incident.reactivate": "Incident reactivated",
  "incident.assign": "Incident assigned",
  "incident.note": "Internal note added",
  "report.file": "Report filed",
  "report.edit": "Report edited by the author",
  "report.resubmit": "Report resubmitted after rejection",
  "report.delete": "Report deleted by the author",
  "comment.create": "Comment posted",
  "comment.remove": "Comment removed",
  "flag.create": "Flagged by a member",
  "flag.resolve": "Flag resolved — action taken",
  "flag.dismiss": "Flag dismissed",
  "self_action.refused": "Decision refused — the operator was involved in the content",
};

/**
 * Why a flag was dismissed without a decision on its case. A ban dismisses
 * every open flag the member raised, one `flag.dismiss` row per flag on the
 * case it sat on (review Q2, contract §2.9), so the case History explains why
 * its flag count dropped — in words, not as the raw `reporter_banned` code.
 */
const FLAG_DISMISS_REASON_LABELS: Record<string, string> = {
  reporter_banned: "The member who raised it was banned",
};

export function historyActionLabel(action: string): string {
  return HISTORY_ACTION_LABELS[action] ?? action;
}

/** Who did it, in words. AI and system rows name the mechanism, never a person. */
export function historyActorName(item: HistoryItem): string {
  switch (item.actorKind) {
    case "ai":
      return "AI check";
    case "system":
      return "System";
    case "admin":
      return item.actor?.name ?? "A moderator";
    case "member":
      return item.actor?.name ?? "A member (account erased)";
  }
}

/**
 * The label for a history row's reason code.
 *
 * One column holds codes from four catalogues, and the action says which one:
 * a reject code and a ban code can share a spelling (`harassment`) while
 * meaning different things to different readers.
 */
export function historyReasonLabel(action: string, code: string | null): string | null {
  if (!code) return null;
  const lookup = (labels: Record<string, string>): string | null => labels[code] ?? null;
  if (action === "member.ban") return lookup(BAN_REASON_LABELS) ?? code;
  if (action === "flag.dismiss") return FLAG_DISMISS_REASON_LABELS[code] ?? code;
  if (action === "incident.dismiss") return lookup(DISMISS_REASON_LABELS) ?? code;
  if (action === "incident.deactivate") return lookup(DEACTIVATE_REASON_LABELS) ?? code;
  if (action === "moderation.hold" || action === "moderation.auto_hide") {
    return lookup(HOLD_REASON_LABELS) ?? code;
  }
  return lookup(REJECT_REASON_LABELS) ?? lookup(HOLD_REASON_LABELS) ?? code;
}

/** Read a `{before, after}` state pair out of audit metadata, if one is there. */
function statePair(
  metadata: Record<string, unknown> | null,
): { before: string | null; after: string | null } | null {
  if (!metadata) return null;
  const read = (side: unknown): string | null => {
    if (!side || typeof side !== "object") return null;
    const value = (side as { moderationState?: unknown }).moderationState;
    return typeof value === "string" ? value : null;
  };
  const before = read(metadata.before);
  const after = read(metadata.after);
  return before || after ? { before, after } : null;
}

const KNOWN_STATES = new Set(["pending", "approved", "held", "rejected", "deactivated"]);

/**
 * "Held for review → Published", when the row records a publication change.
 *
 * The metadata is whatever the writer recorded — for a file it describes the
 * file, for a member their account status — so only values that are real
 * publication states are printed, labelled for the target the row is about.
 */
export function historyStateChange(
  item: HistoryItem,
  targetType: ModerationTargetType,
): string | null {
  const pair = statePair(item.metadata);
  if (!pair || item.targetType === "member" || item.targetType === "evidence") return null;
  // A row about the report or the comment names its own vocabulary; a row about
  // the case or a flag speaks for the case's target.
  const kind: ModerationTargetType =
    item.targetType === "comment" || item.targetType === "report" ? item.targetType : targetType;
  const label = (state: string | null): string | null =>
    state && KNOWN_STATES.has(state)
      ? targetStateLabel(kind, state as TargetModerationState)
      : null;
  const before = label(pair.before);
  const after = label(pair.after);
  if (!before && !after) return null;
  if (before === after) return null;
  return `${before ?? "—"} → ${after ?? "—"}`;
}
