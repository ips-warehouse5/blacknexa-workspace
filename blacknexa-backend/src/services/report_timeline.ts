/**
 * The owner's D2 timeline — case-status events plus owner-safe moderation events.
 *
 * docs/INCIDENT_MODULE_PLAN.md §7.4: "owner-safe moderation events in the
 * timeline (published, with a moderator, not published, taken down, live
 * again)". The publication axis (D1) has no table of its own: every automated,
 * member and staff decision is an `audit_events` row (§4.6), so the owner's view
 * of it is *derived* from those rows here rather than written twice.
 *
 * ── What "owner-safe" means ───────────────────────────────────────────────
 * The audit log is a staff record. Its `note` is an internal note and its hold
 * reasons are staff-only (§3.2), so an event projected for the author carries:
 *
 *   • the event kind and time;
 *   • "by a moderator" when a person decided (never which one), nothing for the
 *     pipeline;
 *   • a reason *label* — never the code's internal context, never the internal
 *     note — and only for rejections and take-downs, the two states whose reason
 *     the author is shown (§3.2). The author-visible note for the *current* state
 *     travels in the owner view's `moderation` block, from the report row.
 *
 * ── How events are derived ────────────────────────────────────────────────
 * The rows are walked in order while tracking the report's publication state.
 * Each row's resulting state is read from its metadata when the writer recorded
 * one (`metadata.after.moderationState` — the pipeline always does, §4.6), and
 * otherwise implied by the action:
 *
 *   report.file                 → pending (approved for a private report)
 *   report.edit / resubmit,
 *   moderation.rerun            → pending
 *   moderation.approve /
 *   auto_approve                → approved
 *   moderation.hold / auto_hide → held
 *   moderation.reject           → rejected
 *   incident.deactivate         → deactivated
 *   incident.reactivate         → whatever its metadata says it restored
 *
 * An event is emitted only when the state actually *changes*, which is what
 * keeps the owner's timeline honest: an evidence-only run that holds a file
 * while the report stays live, or a moderator keeping flagged content up, is
 * not "with a moderator" or "published" again. The events are:
 *
 *   → approved     "published" the first time, "live again" after that
 *   → held         "with a moderator"
 *   → rejected     "not published" + the reject reason label
 *   → deactivated  "taken down" + the deactivate reason label
 *   → pending      nothing (the author edited it, or it is an internal re-check)
 *
 * A report filed before revision 2 has no `report.file` row: it was published at
 * filing, so the walk starts from "approved, already published once".
 *
 * ── Two lists, not one (review R14) ───────────────────────────────────────
 * `timeline` stays exactly what it was before revision 2 — the case-status
 * events, one node each — because that is what the shipped D2 renders: it
 * prints `STATUS_LABEL[event.status]` and ignores `moderationEvent`. Merging the
 * moderation nodes into it (each carrying the case status in force, so it was
 * "still valid") showed every published report as two "Submitted" rows, the
 * second marked as the current step, and a held or rejected one as the same two
 * rows with nothing saying it was not live. The moderation nodes therefore go in
 * the additive `moderationTimeline`; each still carries the case `status` in
 * force at that moment, and a client that understands both merges them by `at`
 * (status node first on a tie: filing writes it before the pipeline decides).
 *
 * Pure: no database, no environment — unit-tested in `report_timeline.test.ts`.
 */

import {
  deactivateReasonLabel,
  dismissReasonLabel,
  rejectReasonLabel,
  type OwnerModerationEvent,
} from "@/types/moderation.interface";
import type { ReportStatus, StatusEventView } from "@/types/report.interface";

/** A `report_status_events` row, as far as the timeline reads it. */
export interface TimelineStatusRow {
  status: ReportStatus;
  at: string;
  actor_kind: string;
  actor_id: string | null;
  note: string | null;
  reason_code: string | null;
}

/** An `audit_events` row, as far as the timeline reads it. `note` is never read. */
export interface TimelineAuditRow {
  action: string;
  actor_kind: string;
  actor_id: string | null;
  reason_code: string | null;
  metadata: Record<string, unknown> | null;
  at: string;
}

/** The audit actions the walk understands — the owner view queries exactly these. */
export const OWNER_TIMELINE_ACTIONS = [
  "report.file",
  "report.edit",
  "report.resubmit",
  "moderation.rerun",
  "moderation.approve",
  "moderation.auto_approve",
  "moderation.hold",
  "moderation.auto_hide",
  "moderation.reject",
  "incident.deactivate",
  "incident.reactivate",
] as const;

export interface OwnerTimeline {
  /** Case-status events only, ascending — the shipped D2's list. */
  timeline: StatusEventView[];
  /** Owner-safe moderation events only, ascending, each with `moderationEvent`. */
  moderationTimeline: StatusEventView[];
  /** Distinct staff who acted (status events and moderation decisions). */
  moderatorIds: Set<string>;
}

type DerivedState = "pending" | "approved" | "held" | "rejected" | "deactivated";

/** The case-status node, with its author-visible reason label when there is one. */
export function statusEventView(row: TimelineStatusRow, options: { withNote: boolean }): StatusEventView {
  const view: StatusEventView = {
    status: row.status,
    at: row.at,
    // Only claimed when a moderator actually acted.
    actorLabel: row.actor_kind === "moderator" ? "by a moderator" : null,
    note: options.withNote ? row.note : null,
  };
  // A dismissal's reason is shown to the author (§3.3); nothing else has one.
  const label = options.withNote && row.status === "dismissed" ? dismissReasonLabel(row.reason_code) : null;
  if (label) view.reasonLabel = label;
  return view;
}

const DERIVED_STATES: readonly DerivedState[] = ["pending", "approved", "held", "rejected", "deactivated"];

function isDerivedState(value: unknown): value is DerivedState {
  return typeof value === "string" && (DERIVED_STATES as readonly string[]).includes(value);
}

/**
 * The publication state a row says it left the report in: `metadata.after`
 * (a state, or `{ moderationState }`), or the older spellings `to` / `nextState`.
 */
function stateFromMetadata(metadata: Record<string, unknown> | null): DerivedState | null {
  if (!metadata) return null;
  for (const key of ["after", "to", "nextState"]) {
    const value = metadata[key];
    if (isDerivedState(value)) return value;
    if (value && typeof value === "object") {
      const nested = (value as { moderationState?: unknown }).moderationState;
      if (isDerivedState(nested)) return nested;
    }
  }
  return null;
}

/** The state an action implies when its row recorded none. */
function stateFromAction(action: string, current: DerivedState, moderated: boolean): DerivedState {
  switch (action) {
    case "report.edit":
    case "report.resubmit":
    case "moderation.rerun":
      return moderated && current !== "deactivated" ? "pending" : current;
    case "moderation.approve":
    case "moderation.auto_approve":
      return "approved";
    case "moderation.hold":
    case "moderation.auto_hide":
      return "held";
    case "moderation.reject":
      return "rejected";
    case "incident.deactivate":
      return "deactivated";
    case "incident.reactivate":
      // Without a recorded outcome, assume the conservative one: back to a
      // check. A later approval then shows as "live again".
      return "pending";
    default:
      return current;
  }
}

/**
 * The case-status events and the derived moderation events, as two ascending
 * lists (see the file header for why they are not merged).
 * `moderated` is `needsModeration(report)` — false for a private report.
 */
export function buildOwnerTimeline(input: {
  moderated: boolean;
  statusEvents: readonly TimelineStatusRow[];
  auditEvents: readonly TimelineAuditRow[];
}): OwnerTimeline {
  const moderatorIds = new Set<string>();
  const statusRows = [...input.statusEvents].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const auditRows = [...input.auditEvents].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  for (const row of statusRows) {
    if (row.actor_kind === "moderator" && row.actor_id) moderatorIds.add(row.actor_id);
  }

  // A report without a filing row predates revision 2 and was live from filing.
  const hasFilingRow = auditRows.some((row) => row.action === "report.file");
  let state: DerivedState = hasFilingRow ? "pending" : "approved";
  let everPublished = !hasFilingRow;

  const moderationNodes: { at: string; event: OwnerModerationEvent; human: boolean; reasonLabel: string | null }[] = [];
  const emit = (row: TimelineAuditRow, event: OwnerModerationEvent, reasonLabel: string | null = null): void => {
    const human = row.actor_kind === "admin";
    if (human && row.actor_id) moderatorIds.add(row.actor_id);
    moderationNodes.push({ at: row.at, event, human, reasonLabel });
  };

  for (const row of auditRows) {
    if (row.action === "report.file") {
      state = input.moderated ? "pending" : "approved";
      // A private report is approved at filing but never "published".
      everPublished = false;
      continue;
    }

    const next: DerivedState =
      stateFromMetadata(row.metadata) ?? stateFromAction(row.action, state, input.moderated);
    if (next === state) continue;

    switch (next) {
      case "approved":
        emit(row, everPublished || state === "deactivated" ? "live_again" : "published");
        everPublished = true;
        break;
      case "held":
        emit(row, "with_moderator");
        break;
      case "rejected":
        emit(row, "not_published", rejectReasonLabel(row.reason_code));
        break;
      case "deactivated":
        emit(row, "taken_down", deactivateReasonLabel(row.reason_code));
        break;
      case "pending":
      default:
        break;
    }
    state = next;
  }

  // The case-status list, untouched (R14).
  const timeline: StatusEventView[] = statusRows.map((row) => statusEventView(row, { withNote: true }));

  // Each moderation node carries the case status in force at its moment. On
  // equal timestamps the status event counts as already in force: filing writes
  // the `submitted` event and the pipeline decides after it.
  const moderationTimeline: StatusEventView[] = [];
  let statusIndex = 0;
  let currentStatus: ReportStatus = statusRows[0]?.status ?? "submitted";
  for (const node of moderationNodes) {
    while (statusIndex < statusRows.length && statusRows[statusIndex].at <= node.at) {
      currentStatus = statusRows[statusIndex].status;
      statusIndex += 1;
    }
    const view: StatusEventView = {
      status: currentStatus,
      at: node.at,
      actorLabel: node.human ? "by a moderator" : null,
      note: null,
      moderationEvent: node.event,
    };
    if (node.reasonLabel) view.reasonLabel = node.reasonLabel;
    moderationTimeline.push(view);
  }

  return { timeline, moderationTimeline, moderatorIds };
}
