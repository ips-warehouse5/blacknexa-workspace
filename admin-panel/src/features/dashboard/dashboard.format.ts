/**
 * Display helpers for the dashboard.
 *
 * Kept out of the component modules so fast refresh keeps working on them, and
 * so the chart, its table and its tooltips name a bucket the same way.
 *
 * ── Why bucket dates are printed in UTC ─────────────────────────────────────
 * Everywhere else the console prints instants in the operator's local time.
 * A metrics bucket is not an instant: `2026-09-24` is the UTC day the server
 * counted. Formatting it as local time would label that bar "Sep 23" for
 * anyone west of Greenwich — the bar would still count the 24th. So bucket
 * labels are formatted with `timeZone: "UTC"`, and the relative times on the
 * alerts ("12 minutes ago") are instants and need no zone at all.
 */

import { formatDistanceStrict } from "date-fns";

import { ApiError } from "@/types/api";

import type { IncidentListItem } from "@/features/incidents/incidents.types";
import { REPORT_STATUS_LABELS } from "@/features/incidents/incidents.types";
import {
  SAFETY_RISK_LABELS,
  hasSafetyRisk,
  type CaseListItem,
} from "@/features/moderation/moderation.types";
import {
  ACTIVITY_SERIES_CAPTIONS,
  METRICS_RANGE_OPTIONS,
  type ActivitySeries,
  type IncidentActivityPoint,
  type IncidentMetricsBucket,
  type IncidentMetricsByStatus,
  type IncidentMetricsRange,
  type UrgentAlert,
} from "@/features/dashboard/dashboard.types";

/** The server's message when there is one (written to be shown as-is), else the fallback. */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

// ── Bucket labels ───────────────────────────────────────────────────────────

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A bucket's `YYYY-MM-DD` as a Date at UTC midnight, or null when malformed. */
function bucketDate(date: string): Date | null {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The full name of a bucket: "Thu, Sep 24, 2026" or "September 2026". */
export function bucketName(date: string, bucket: IncidentMetricsBucket): string {
  const parsed = bucketDate(date);
  if (!parsed) return date;
  return (bucket === "month" ? MONTH_LONG : DAY_LONG).format(parsed);
}

/**
 * The label under one bar, or null for a bar that goes unlabelled.
 *
 * Seven days read best as weekdays (the prototype's "Mon … Sun") and twelve
 * months as month names. Thirty or ninety bars cannot each carry a date, so
 * every seventh or fourteenth is labelled, counted back from the newest — the
 * bar in progress always has its label.
 */
export function axisLabel(
  date: string,
  index: number,
  count: number,
  bucket: IncidentMetricsBucket,
): string | null {
  const parsed = bucketDate(date);
  if (!parsed) return null;
  if (bucket === "month") return MONTH.format(parsed);
  if (count <= 7) return WEEKDAY.format(parsed);
  const every = count <= 31 ? 7 : 14;
  return (count - 1 - index) % every === 0 ? DAY.format(parsed) : null;
}

/** The hover text on one bar: its bucket and all three measures. */
export function bucketTooltip(
  point: IncidentActivityPoint,
  bucket: IncidentMetricsBucket,
  inProgress: boolean,
): string {
  const name = bucketName(point.date, bucket);
  const suffix = inProgress ? " (so far)" : "";
  return `${name}${suffix}: ${point.filed} filed · ${point.published} published · ${point.held} held`;
}

/** "Reports filed per day over the last 7 days". */
export function activityCaption(
  series: ActivitySeries,
  bucket: IncidentMetricsBucket,
  range: IncidentMetricsRange,
): string {
  return `${ACTIVITY_SERIES_CAPTIONS[series]} per ${bucket} ${rangePhrase(range)}`;
}

/** "over the last 30 days". */
export function rangePhrase(range: IncidentMetricsRange): string {
  return METRICS_RANGE_OPTIONS.find((option) => option.value === range)?.phrase ?? "";
}

/** The bucket a range is drawn in, before its data arrives. */
export function bucketFor(range: IncidentMetricsRange): IncidentMetricsBucket {
  return range === "12m" ? "month" : "day";
}

// ── Shares ──────────────────────────────────────────────────────────────────

/**
 * A category's share of what was filed: the exact percentage for the bar, and
 * a rounded label that never says "0%" for a category that has reports.
 */
export function sharePercent(count: number, total: number): { value: number; label: string } {
  if (total <= 0 || count <= 0) return { value: 0, label: "0%" };
  const value = (count / total) * 100;
  return { value, label: value < 1 ? "<1%" : `${Math.round(value)}%` };
}

/** The status split under the chart, in the Incidents screen's tab order. */
export const STATUS_SPLIT: readonly { key: keyof IncidentMetricsByStatus; label: string }[] = [
  { key: "submitted", label: REPORT_STATUS_LABELS.submitted },
  { key: "under_review", label: REPORT_STATUS_LABELS.under_review },
  { key: "verified", label: REPORT_STATUS_LABELS.verified },
  { key: "dismissed", label: REPORT_STATUS_LABELS.dismissed },
  { key: "deactivated", label: "Deactivated" },
];

// ── Urgent Queue Alerts ─────────────────────────────────────────────────────

/** How many rows the alert card shows. */
export const URGENT_ALERT_LIMIT = 6;

/** "12 minutes" (or "12 minutes ago"), or null for a timestamp that cannot be read. */
function distance(iso: string, now: Date, addSuffix: boolean): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceStrict(date, now, { addSuffix });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function caseAlert(item: CaseListItem, now: Date): UrgentAlert {
  const ref = item.report.caseRef;
  const isComment = item.targetType === "comment";
  const parts: string[] = [];
  if (hasSafetyRisk(item.safetyRisk)) parts.push(`Safety risk: ${SAFETY_RISK_LABELS[item.safetyRisk]}`);
  if (item.sources.ai) parts.push("AI flag");
  if (item.sources.keyword) parts.push("Keyword match");
  if (item.sources.user) parts.push(plural(item.userFlagCount, "user flag"));
  if (item.sources.media) parts.push("Media review");
  const waiting = distance(item.openedAt, now, false);
  if (waiting) parts.push(`Waiting ${waiting}`);
  return {
    key: `case:${item.id}`,
    kind: "case",
    // A comment's text stays in the queue; the dashboard names where it was posted.
    title: isComment ? `Comment on ${ref}` : `${ref} · ${item.report.title}`,
    detail: parts.join(" · "),
    to: `/moderation/${item.id}`,
    linkLabel: isComment
      ? `Open the moderation case for the comment on ${ref}`
      : `Open the moderation case for ${ref}`,
    urgent: item.urgent,
    safetyRisk: item.safetyRisk,
    slaBreached: false,
  };
}

function incidentAlert(item: IncidentListItem, now: Date, selfId: string | null): UrgentAlert {
  let assignee = "Unassigned";
  if (item.assignee) {
    assignee = item.assignee.id === selfId ? "Assigned to you" : `Assigned to ${item.assignee.name}`;
  }
  const parts = [item.location ?? "Area not given", assignee];
  // The unassigned slice is all `submitted`; an advocate's slice is under review.
  if (item.status !== "submitted") parts.push(REPORT_STATUS_LABELS[item.status]);
  const filed = distance(item.submittedAt, now, true);
  if (filed) parts.push(`Filed ${filed}`);
  return {
    key: `incident:${item.id}`,
    kind: "incident",
    title: `${item.caseRef} · ${item.title}`,
    detail: parts.join(" · "),
    to: `/incidents/${item.id}`,
    linkLabel: `Open incident ${item.caseRef}`,
    urgent: item.urgent,
    safetyRisk: null,
    slaBreached: item.slaBreached,
  };
}

/**
 * The card's rows, most pressing first.
 *
 *   1. Moderation cases with a safety risk (D21 — self-harm, imminent danger).
 *   2. Urgent reports past the response SLA, still unassigned — as their
 *      moderation case when they have an open one, else as the incident.
 *   3. Other urgent moderation cases.
 *   4. Other urgent incidents waiting on someone.
 *
 * Within a group the server's order holds: cases by priority, incidents oldest
 * first. `cases` is the first page of the open queue, so anything neither
 * urgent nor a safety risk is dropped here. `hidden` counts what the limit cut.
 *
 * One row per report. An urgent report with an open moderation case is also an
 * urgent incident, usually an unassigned one — always, when it is held, since
 * an unpublished incident cannot be verified or dismissed until its case is
 * resolved ("Resolve the moderation case first", §9.2). It is listed once, as
 * the case — the step that comes first — carrying the incident's SLA marker.
 * A comment's case is about the comment, not its report, and never stands in
 * for the incident.
 */
export function buildUrgentAlerts(
  cases: readonly CaseListItem[],
  incidents: readonly IncidentListItem[],
  now: Date,
  options: { limit?: number; selfId?: string | null } = {},
): { alerts: UrgentAlert[]; hidden: number } {
  const limit = options.limit ?? URGENT_ALERT_LIMIT;
  const selfId = options.selfId ?? null;
  const openCases = cases.filter(
    (item) => item.state === "open" && (item.urgent || hasSafetyRisk(item.safetyRisk)),
  );
  const urgentIncidents = incidents.filter((item) => item.urgent);

  const breachedReports = new Set(
    urgentIncidents.filter((item) => item.slaBreached).map((item) => item.id),
  );
  const reportsWithCase = new Set(
    openCases.filter((item) => item.targetType === "report").map((item) => item.report.id),
  );

  const isBreachedCase = (item: CaseListItem): boolean =>
    item.targetType === "report" && breachedReports.has(item.report.id);
  const toCaseAlert = (item: CaseListItem): UrgentAlert => {
    const alert = caseAlert(item, now);
    return isBreachedCase(item) ? { ...alert, slaBreached: true } : alert;
  };
  const safetyCases = openCases.filter((item) => hasSafetyRisk(item.safetyRisk));
  const urgentCases = openCases.filter((item) => !hasSafetyRisk(item.safetyRisk));
  const standalone = urgentIncidents.filter((item) => !reportsWithCase.has(item.id));

  const all = [
    ...safetyCases.map(toCaseAlert),
    // Past the SLA: reports with an open case first (the case is the next step), then the rest.
    ...urgentCases.filter(isBreachedCase).map(toCaseAlert),
    ...standalone.filter((item) => item.slaBreached).map((item) => incidentAlert(item, now, selfId)),
    ...urgentCases.filter((item) => !isBreachedCase(item)).map(toCaseAlert),
    ...standalone.filter((item) => !item.slaBreached).map((item) => incidentAlert(item, now, selfId)),
  ];
  return { alerts: all.slice(0, limit), hidden: Math.max(0, all.length - limit) };
}
