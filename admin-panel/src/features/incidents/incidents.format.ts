/**
 * Display helpers for Incident Management.
 *
 * Kept out of the component modules so fast refresh keeps working on them, and
 * so the list and the detail print a timestamp, an author and an occurrence
 * time the same way. Every timestamp from the API is ISO-8601 UTC and is shown
 * in the operator's local time — the same zone the date filter bounds in
 * (`incidents.api.ts`).
 */

import { format } from "date-fns";

import {
  DAY_PART_LABELS,
  MODERATION_STATE_LABELS,
  MODERATION_STATE_TONES,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
  type IncidentAuthorRef,
  type IncidentReportView,
  type ReportModerationState,
  type ReportStatus,
} from "@/features/incidents/incidents.types";
import type { BadgeTone } from "@/components/ui/Badge";

/** A Date, or null when the API sent something unparseable. */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Aug 27, 2026" — the list's first line. */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "MMM d, yyyy") : "—";
}

/** "09:41 AM" — the list's second line. */
export function formatTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "hh:mm a") : "";
}

/** "Aug 27, 2026 · 09:41 AM" — the detail's timestamps. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? format(date, "MMM d, yyyy · hh:mm a") : "—";
}

/**
 * When it happened, as precisely as the reporter said.
 *
 * The wizard lets a reporter give an exact time, a part of the day, or only the
 * date; printing "12:00 AM" for a report whose time was never given would put a
 * time on the record that nobody stated.
 */
export function formatOccurred(
  report: Pick<IncidentReportView, "occurredAt" | "occurredPrecision" | "occurredDayPart">,
): string {
  const date = parse(report.occurredAt);
  if (!date) return "Not recorded";
  switch (report.occurredPrecision) {
    case "exact":
      return format(date, "MMM d, yyyy · hh:mm a");
    case "day_part":
      return report.occurredDayPart
        ? `${format(date, "MMM d, yyyy")} · ${DAY_PART_LABELS[report.occurredDayPart]}`
        : format(date, "MMM d, yyyy");
    case "unknown":
    default:
      return `${format(date, "MMM d, yyyy")} · time not given`;
  }
}

/**
 * The author, as a table cell or an info cell prints them.
 *
 * Null means the account is gone and the report lives on as an anonymous
 * community record; a hidden identity is the server's "Anonymous" (tiers that
 * may not see who filed an anonymous report, contract §3.0). An anonymous
 * report whose author this operator *may* see says so, because the author
 * chose not to be named publicly and nobody should repeat the name by mistake.
 */
export function authorLabel(author: IncidentAuthorRef | null): string {
  if (!author) return "Anonymous community record";
  if (author.identityHidden) return "Anonymous";
  return author.anonymous ? `${author.displayName} (posted anonymously)` : author.displayName;
}

/**
 * The status pill for an incident.
 *
 * Deactivation is a publication state (D10), but the queue's sixth tab is
 * "Deactivated" and the prototype printed it as a status, so a deactivated
 * incident wears that pill in place of its case status.
 */
export function statusPill(state: {
  status: ReportStatus;
  moderationState: ReportModerationState;
}): { label: string; tone: BadgeTone } {
  if (state.moderationState === "deactivated") {
    return { label: MODERATION_STATE_LABELS.deactivated, tone: MODERATION_STATE_TONES.deactivated };
  }
  return { label: REPORT_STATUS_LABELS[state.status], tone: REPORT_STATUS_TONES[state.status] };
}

/**
 * The moderation chip, or null when none is due.
 *
 * Shown only while an incident is not published and not deactivated — the
 * states in which its case decisions wait on Content Moderation.
 */
export function moderationChip(
  moderationState: ReportModerationState,
): { label: string; tone: BadgeTone } | null {
  if (moderationState === "approved" || moderationState === "deactivated") return null;
  return {
    label: MODERATION_STATE_LABELS[moderationState],
    tone: MODERATION_STATE_TONES[moderationState],
  };
}

/** Matches the route param: the report's UUID. Anything else is not an incident id. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isIncidentId(value: string | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
