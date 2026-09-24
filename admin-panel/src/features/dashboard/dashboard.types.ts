/**
 * Dashboard shapes.
 *
 * `IncidentMetrics` mirrors `GET /admin/incidents/metrics` field for field —
 * the contract is `blacknexa-backend/docs/ADMIN_MODERATION_API.md` §3.7 and
 * the server's wire types are in `services/incident_admin.service.ts`. The KPI
 * tiles and the urgent alerts read Incident Management's and Content
 * Moderation's own types; only what the dashboard alone defines lives here.
 */

import type { ReportCategory } from "@/features/incidents/incidents.types";
import type { SafetyRisk } from "@/features/moderation/moderation.types";

// ── Metrics (contract §3.7) ─────────────────────────────────────────────────

export const METRICS_RANGES = ["7d", "30d", "90d", "12m"] as const;

export type IncidentMetricsRange = (typeof METRICS_RANGES)[number];

/** Day buckets for 7d / 30d / 90d, calendar months for 12m. UTC on the server. */
export type IncidentMetricsBucket = "day" | "month";

export interface IncidentActivityPoint {
  /** The bucket's first day, `YYYY-MM-DD` (UTC). A month bucket is its 1st. */
  date: string;
  /** Reports filed in the bucket. */
  filed: number;
  /** Public or trusted reports that went live for the first time. */
  published: number;
  /** Times a report was sent to a moderator (moved into `held`). */
  held: number;
}

export interface IncidentCategoryCount {
  category: ReportCategory;
  /** The server's label ("Policing", "Housing", …). */
  label: string;
  count: number;
}

/** Where the reports filed in the range stand now; adds up to `totals.filed`. */
export interface IncidentMetricsByStatus {
  submitted: number;
  under_review: number;
  verified: number;
  dismissed: number;
  deactivated: number;
}

export interface IncidentMetrics {
  range: IncidentMetricsRange;
  bucket: IncidentMetricsBucket;
  /** Start of the first bucket (ISO, UTC midnight). */
  from: string;
  /** Every bucket in the window, oldest first; empty buckets are zeros. */
  activity: IncidentActivityPoint[];
  totals: { filed: number; published: number; held: number };
  /** All nine categories, most first. */
  categories: IncidentCategoryCount[];
  byStatus: IncidentMetricsByStatus;
  generatedAt: string;
}

/** The activity chart's date filter, in the prototype's wording. */
export const METRICS_RANGE_OPTIONS: readonly {
  value: IncidentMetricsRange;
  label: string;
  /** Completes "Reports filed …" in the card captions. */
  phrase: string;
}[] = [
  { value: "7d", label: "Last 7 Days", phrase: "over the last 7 days" },
  { value: "30d", label: "Last 30 Days", phrase: "over the last 30 days" },
  { value: "90d", label: "Last 90 Days", phrase: "over the last 90 days" },
  { value: "12m", label: "Last 12 Months", phrase: "over the last 12 months" },
];

// ── The activity chart's measures ───────────────────────────────────────────

export const ACTIVITY_SERIES = ["filed", "published", "held"] as const;

export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

export const ACTIVITY_SERIES_LABELS: Record<ActivitySeries, string> = {
  filed: "Filed",
  published: "Published",
  held: "Held",
};

/** What one bar counts, for the caption: "Reports filed per day …". */
export const ACTIVITY_SERIES_CAPTIONS: Record<ActivitySeries, string> = {
  filed: "Reports filed",
  published: "Reports published for the first time",
  held: "Reports sent to a moderator",
};

/** What an empty measure says instead of a flat row of zero bars. */
export const ACTIVITY_SERIES_EMPTY: Record<ActivitySeries, string> = {
  filed: "No reports were filed in this period.",
  published: "No reports went live in this period.",
  held: "No reports were sent to a moderator in this period.",
};

// ── Urgent Queue Alerts ─────────────────────────────────────────────────────

/** One row of the alert card — a moderation case or an incident. */
export interface UrgentAlert {
  /** Unique across both kinds (`case:<id>`, `incident:<id>`). */
  key: string;
  kind: "case" | "incident";
  title: string;
  detail: string;
  /** `/moderation/<caseId>` or `/incidents/<reportId>`. */
  to: string;
  /** The eye button's accessible name and tooltip. */
  linkLabel: string;
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
  slaBreached: boolean;
}

// ── Who is looking ──────────────────────────────────────────────────────────

/**
 * What the signed-in role may read, resolved once per render of the page and
 * handed to each card. A card never asks for what its role cannot read — a
 * 403 is a settled answer, but a dashboard that collects one on every visit
 * looks broken — and a tile or source the role cannot read is left out rather
 * than shown with prototype figures. The server re-checks every call.
 */
export interface DashboardAccess {
  /** `incidents.view` — Total Incidents, both charts, urgent incidents. */
  incidents: boolean;
  /** `moderation.view` — Pending Moderation, urgent moderation cases. */
  moderation: boolean;
  /** `contact.view` — Support Inquiries. */
  contact: boolean;
  /** `staff.view` — Verified Advocates. */
  staff: boolean;
  /** Advocates: every incident figure is their own assignments (D17). */
  assignedOnly: boolean;
  /** The operator's id, so an alert can say "Assigned to you". */
  selfId: string | null;
}
