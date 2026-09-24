/**
 * Incident Management for the console — the case-verification axis, assignment
 * and internal notes.
 *
 * docs/INCIDENT_MODULE_PLAN.md §9.1 (the API), §9.2 (the console), D1, D10,
 * D16, D17, D19, D20. The console calls a filed report an *incident*; the
 * backend calls it a report (`reports`, `BNX-####`). This file is the prototype's
 * Incident Management workflow made real: list and counts, detail with a real
 * lifecycle, Verify, Dismiss, Reopen, Deactivate, Reactivate, Assign, Notes —
 * plus the dashboard's activity and category figures (`metrics`, §11 Phase 3C).
 *
 * ── Two axes, and which one each action moves (D1) ────────────────────────
 *   • Verify / Dismiss / Reopen move `status` — the *case verdict* — through
 *     `reportService.transition`, inside this file's transaction, with
 *     `requireModerationStates: ['approved']`: an incident that is not
 *     published has a moderation case to resolve first ("Resolve the moderation
 *     case first", §9.2). The prototype's Verify copy — "the content decision is
 *     unchanged" — is literally true: nothing here touches publication.
 *   • Deactivate / Reactivate move `moderation_state` — *publication* (D10).
 *     Deactivation works from any state, remembers where it came from
 *     (`pre_deactivation_state` / `_version`), supersedes every open moderation
 *     case on the report and its comments, cancels their queued runs, resolves
 *     their flags, and tells the author the reason label. Reactivation restores
 *     `approved` only when the report was approved and its content has not
 *     changed since; otherwise it goes back to `pending` with a `manual` run —
 *     and a report that had been *rejected* by a human goes back with a
 *     `resubmitted` run, so the AI cannot approve what a moderator refused
 *     (D19). A private report is approved outright and never queued (D3).
 *   • Assign sets the assignee; assigning an approved `submitted` incident also
 *     moves it to `under_review` (D17). Assignees are active admins whose role
 *     is `moderator` or `advocate`. Verifying an unassigned incident assigns it
 *     to the verifier first when they hold one of those roles (the prototype's
 *     flow, review Q20); a superadmin verifier leaves it unassigned.
 *
 * ── Access (§9.1, D17) ────────────────────────────────────────────────────
 * Every `/:id` route goes through `loadIncidentFor` (`admin_guard.service.ts`):
 * advocates see only incidents assigned to them (404 otherwise), staff see
 * metadata only. The list, the summary and the metrics apply the same scope — an
 * advocate's list is forced to `assignee = me` whatever they ask for — and the detail is
 * built in full, then cut down by the pure `redactIncidentDetail`, so the tier
 * is enforced in exactly one place. Who filed an anonymous report is shown only
 * to roles with `moderation.view` or `incidents.verify`; search by author name
 * cannot reach anonymous reports for anyone else.
 *
 * ── Decisions ─────────────────────────────────────────────────────────────
 * Lock the report → re-check on the locked row → write → audit, in one
 * `adminTransaction` (5 s lock timeout → 409; D16 refusals audited). Every
 * decision's audit row carries `before` / `after` `{moderationState, status}`
 * — the owner timeline reads `after.moderationState` to tell "live again" from
 * "back to a check" (report_timeline.ts). Internal notes given with a decision
 * are stored as `report_notes` rows, so they appear in *Internal Admin Notes*,
 * and never on the author's timeline. Pushes leave after the commit (D18); a
 * reactivation that queued a run rings `pokeModeration()`.
 */

import { Op, QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report, ReportEvidence, ReportStatusEvent } from "@/models/report.model";
import { ReportCorroboration, ReportFlag } from "@/models/report_social.model";
import { AppUser } from "@/models/app_user.model";
import { AdminUser } from "@/models/admin_user.model";
import { AuditEvent, ReportNote } from "@/models/moderation.model";
import reportService from "@/services/report.service";
import evidenceStrengthService from "@/services/evidence_strength.service";
import { awaitsResubmissionCheck } from "@/services/evidence.service";
import notificationService, { type PendingPush } from "@/services/notification.service";
import moderationCaseService, { type ResolvedFlagRow } from "@/services/moderation_case.service";
import { cancelRunsForReport, enqueueRun, maxAttemptsFor } from "@/services/moderation_enqueue";
import { pokeModeration } from "@/services/moderation_signal";
import auditService from "@/services/audit.service";
import flagService, { type FlagClosure } from "@/services/flag.service";
import {
  buildAdminReportView,
  evidenceLinkFor,
  type AdminReportView,
  type EvidenceLink,
} from "@/services/moderation_admin.service";
import {
  adminTransaction,
  assertNotSelf,
  assertReason,
  conflict,
  incidentAccessFor,
  isoOf,
  likePattern,
  loadAdminRefs,
  loadIncidentFor,
  normaliseEmail,
  type AdminActor,
  type AdminRef,
  type IncidentAccess,
} from "@/services/admin_guard.service";
import { badRequest, notFound } from "@/middlewares/error.middleware";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/types/admin.interface";
import {
  OWNER_NOTIFICATIONS,
  RUN_PRIORITY,
  deactivateReasonLabel,
  dismissReasonLabel,
  displayStatusOf,
  needsModeration,
  ownerReasonLabel,
  rejectReasonLabel,
  type AuditActorKind,
  type DeactivateReasonCode,
  type DismissReasonCode,
  type DisplayStatus,
  type ReportModerationState,
  type RunTrigger,
} from "@/types/moderation.interface";
import {
  ALL_REPORT_CATEGORIES,
  CATEGORY_LABELS,
  type EvidenceStrength,
  type ReportCategory,
  type ReportStatus,
} from "@/types/report.interface";
import type { UserStatus, Visibility } from "@/types/user.interface";

// ─────────────────────────────────────────────────────────────────────────────
// Wire types — mirrored exactly in docs/ADMIN_MODERATION_API.md
// ─────────────────────────────────────────────────────────────────────────────

/** The six tabs. `deactivated` filters publication; every other tab excludes it. */
export type IncidentStatusTab = "all" | "submitted" | "under_review" | "verified" | "dismissed" | "deactivated";

export const INCIDENT_STATUS_TABS: readonly IncidentStatusTab[] = [
  "all",
  "submitted",
  "under_review",
  "verified",
  "dismissed",
  "deactivated",
];

export type IncidentRange = "today" | "week" | "month";
export type IncidentSort = "newest" | "oldest";
/** The publication filter chip. `deactivated` is its own tab, so it is not offered here. */
export type IncidentModerationFilter = Exclude<ReportModerationState, "deactivated">;

export interface IncidentListQuery {
  page: number;
  limit: number;
  status: IncidentStatusTab;
  category?: ReportCategory;
  /** ISO date (`YYYY-MM-DD`, whole day) or date-time. Ignored when `range` is set. */
  from?: string;
  to?: string;
  range?: IncidentRange;
  search?: string;
  sort: IncidentSort;
  /** `me`, `unassigned`, or an admin id. Advocates are always `me`. */
  assignee?: string;
  moderation?: IncidentModerationFilter;
  urgent?: boolean;
}

export interface IncidentAssigneeRef {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
}

/** The author as the list shows them — anonymity respected per access tier. */
export interface IncidentAuthorRef {
  /** Null when the caller may not see who filed an anonymous report. */
  id: string | null;
  /** "Anonymous" when hidden. */
  displayName: string;
  /** The report was filed anonymously. */
  anonymous: boolean;
  /** True when this caller is not shown who filed it. */
  identityHidden: boolean;
}

export interface IncidentListItem {
  id: string;
  caseRef: string;
  title: string;
  category: ReportCategory;
  location: string | null;
  status: ReportStatus;
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
  urgent: boolean;
  slaBreached: boolean;
  visibility: Visibility;
  submittedAt: string;
  assignee: IncidentAssigneeRef | null;
  assignedAt: string | null;
  /** Null when the author's account was deleted and the report kept as anonymous record. */
  author: IncidentAuthorRef | null;
  evidenceCount: number;
  openFlags: number;
  openCaseId: string | null;
}

export interface IncidentSummary {
  all: number;
  submitted: number;
  under_review: number;
  verified: number;
  dismissed: number;
  deactivated: number;
  assignedToMe: number;
  unassigned: number;
  urgent: number;
  slaBreached: number;
}

export interface AssigneeOption {
  id: string;
  name: string;
  email: string;
  role: "moderator" | "advocate";
  roleLabel: string;
  /** Submitted or under-review incidents currently assigned to them. */
  openAssigned: number;
}

export interface IncidentAuthorView extends IncidentAuthorRef {
  /** Only for tiers that see content (not staff), and only when identity is visible. */
  email: string | null;
  status: UserStatus | null;
  memberSince: string | null;
}

/** The staff report projection, cut to the caller's tier. */
export interface IncidentReportView extends AdminReportView {
  /** True when the tier may not see the body, exact location or evidence files. */
  contentRedacted: boolean;
}

export type IncidentTimelineKind = "status" | "moderation" | "assignment" | "author";

export interface IncidentTimelineItem {
  id: string;
  at: string;
  kind: IncidentTimelineKind;
  /** `status.<status>` for case-status events, otherwise the audit action. */
  action: string;
  label: string;
  /** The case status an event moved to (status events only). */
  status: ReportStatus | null;
  actor: { kind: AuditActorKind; id: string | null; name: string | null };
  reasonCode: string | null;
  reasonLabel: string | null;
  note: string | null;
  /** `author` — shown to the author on their timeline; `internal` — staff only. */
  noteVisibility: "author" | "internal" | null;
  moderationState: { before: string | null; after: string | null } | null;
  /** Assignment events only. */
  assignee: { id: string; name: string | null } | null;
}

export interface IncidentNoteView {
  id: string;
  body: string;
  createdAt: string;
  author: AdminRef | null;
}

/** Which workflow buttons the state allows (permissions are the console's to combine). */
export interface IncidentActions {
  verify: boolean;
  dismiss: boolean;
  reopen: boolean;
  deactivate: boolean;
  reactivate: boolean;
  assign: boolean;
  /** Not published and not deactivated: the moderation case has to be resolved first. */
  resolveModerationFirst: boolean;
}

export interface IncidentDetail {
  access: IncidentAccess;
  report: IncidentReportView;
  author: IncidentAuthorView | null;
  assignee: (IncidentAssigneeRef & { assignedAt: string | null; assignedBy: AdminRef | null }) | null;
  moderation: {
    state: ReportModerationState;
    displayStatus: DisplayStatus;
    reasonCode: string | null;
    reasonLabel: string | null;
    note: string | null;
    moderatedAt: string | null;
    openCaseId: string | null;
    preDeactivationState: ReportModerationState | null;
    /** What Reactivate would do now; null unless deactivated. */
    reactivateRestores: "approved" | "pending" | null;
  };
  verifiedBy: AdminRef | null;
  verifiedAt: string | null;
  /** Oldest first. */
  timeline: IncidentTimelineItem[];
  /** Newest first. */
  notes: IncidentNoteView[];
  counts: {
    evidence: number;
    openFlags: number;
    flags: number;
    comments: number;
    supports: number;
    corroborations: number;
    notes: number;
  };
  evidenceStrength: { strength: EvidenceStrength; rationale: string };
  actions: IncidentActions;
}

/** What every incident decision answers with. */
export interface IncidentStateView {
  id: string;
  caseRef: string;
  status: ReportStatus;
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
  moderationReason: string | null;
  moderationReasonLabel: string | null;
  moderationNote: string | null;
  assignee: IncidentAssigneeRef | null;
  assignedAt: string | null;
  verifiedAt: string | null;
  /** The run a reactivation queued, when it went back to a check. */
  runId: string | null;
  /** False when the call changed nothing (re-assigning the same person). */
  changed: boolean;
}

/** `GET /metrics` — the dashboard's date ranges (plan §11 Phase 3C). */
export type IncidentMetricsRange = "7d" | "30d" | "90d" | "12m";

export const INCIDENT_METRICS_RANGES: readonly IncidentMetricsRange[] = ["7d", "30d", "90d", "12m"];

/** Day buckets for 7d / 30d / 90d, calendar months for 12m. UTC throughout. */
export type IncidentMetricsBucket = "day" | "month";

export interface IncidentActivityPoint {
  /** The bucket's first day, `YYYY-MM-DD` (UTC); a month bucket is the 1st. */
  date: string;
  /** Reports filed in the bucket. */
  filed: number;
  /** Public or trusted reports that went live for the first time (`published_at`, D11). */
  published: number;
  /** Times a report moved into `held` — the automated check, a flag re-check, the terminal fallback. */
  held: number;
}

export interface IncidentCategoryCount {
  category: ReportCategory;
  label: string;
  count: number;
}

/**
 * Where the reports filed in the range stand now. `deactivated` is its own
 * bucket, as on the list's tabs, so the five add up to `totals.filed`.
 */
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
  /** Start of the first bucket (ISO, UTC midnight). The window runs to `generatedAt`. */
  from: string;
  /** Every bucket in the window, oldest first — empty buckets included as zeros. */
  activity: IncidentActivityPoint[];
  /** Sums of `activity`. */
  totals: { filed: number; published: number; held: number };
  /** All nine categories for reports filed in the range, most first (ties in the C1 order). */
  categories: IncidentCategoryCount[];
  byStatus: IncidentMetricsByStatus;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — unit-tested in incident_admin.service.test.ts
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The `filed_at` window a list asks for, as ISO bounds (inclusive). */
export function incidentDateWindow(
  input: { range?: IncidentRange; from?: string; to?: string },
  now: Date,
): { fromIso: string | null; toIso: string | null } {
  if (input.range) {
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    switch (input.range) {
      case "today":
        return { fromIso: new Date(startOfDay).toISOString(), toIso: null };
      case "week":
        return { fromIso: new Date(now.getTime() - 7 * DAY_MS).toISOString(), toIso: null };
      case "month":
        return { fromIso: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), toIso: null };
    }
  }
  const bound = (value: string | undefined, endOfDay: boolean): string | null => {
    if (!value) return null;
    if (DATE_ONLY.test(value)) return `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };
  return { fromIso: bound(input.from, false), toIso: bound(input.to, true) };
}

/**
 * Every filter of `GET /admin/incidents` as WHERE clauses over `reports r` and
 * the author `app_users u`. The access tier is applied here, not by the caller:
 * an advocate is scoped to their own assignments whatever `assignee` says, and
 * search by author name skips anonymous reports for tiers that may not see who
 * filed them.
 */
export function incidentListWhere(
  query: Pick<IncidentListQuery, "status" | "category" | "from" | "to" | "range" | "search" | "assignee" | "moderation" | "urgent">,
  ctx: { access: IncidentAccess; adminId: string; now: Date },
): { clauses: string[]; replacements: Record<string, unknown> } {
  const clauses = ["r.deleted_at IS NULL"];
  const replacements: Record<string, unknown> = {};

  if (query.status === "deactivated") {
    clauses.push("r.moderation_state = 'deactivated'");
  } else {
    clauses.push("r.moderation_state <> 'deactivated'");
    if (query.status !== "all") {
      clauses.push("r.status = :status");
      replacements.status = query.status;
    }
  }

  if (ctx.access.assignedOnly) {
    clauses.push("r.assigned_admin_id = :adminId");
    replacements.adminId = ctx.adminId;
  } else if (query.assignee === "me") {
    clauses.push("r.assigned_admin_id = :adminId");
    replacements.adminId = ctx.adminId;
  } else if (query.assignee === "unassigned") {
    clauses.push("r.assigned_admin_id IS NULL");
  } else if (query.assignee) {
    clauses.push("r.assigned_admin_id = :assigneeId");
    replacements.assigneeId = query.assignee;
  }

  if (query.category) {
    clauses.push("r.category = :category");
    replacements.category = query.category;
  }

  const window = incidentDateWindow(query, ctx.now);
  if (window.fromIso) {
    clauses.push("r.filed_at >= :fromIso");
    replacements.fromIso = window.fromIso;
  }
  if (window.toIso) {
    clauses.push("r.filed_at <= :toIso");
    replacements.toIso = window.toIso;
  }

  if (query.moderation) {
    clauses.push("r.moderation_state = :moderation");
    replacements.moderation = query.moderation;
  }
  if (typeof query.urgent === "boolean") {
    clauses.push("r.urgent = :urgent");
    replacements.urgent = query.urgent;
  }

  const search = query.search?.trim();
  if (search) {
    const identity = ctx.access.seesAnonymousIdentity ? "" : "r.anonymous = false AND ";
    const parts = [
      "r.case_ref ILIKE :search",
      "r.title ILIKE :search",
      "r.location_label ILIKE :search",
      `(${identity}u.display_name ILIKE :search)`,
    ];
    if (ctx.access.seesAuthorEmail) parts.push(`(${identity}u.email ILIKE :search)`);
    clauses.push(`(${parts.join(" OR ")})`);
    replacements.search = likePattern(search);
  }

  return { clauses, replacements };
}

/**
 * The C6 promise, broken: an urgent incident still `submitted` and unassigned
 * past the SLA (any publication state — the same rule `/admin/moderation/stats`
 * counts as `urgentUnassignedBreached`).
 */
export function isSlaBreached(
  row: { urgent: boolean; status: string; assignedAdminId: string | null; filedAt: string },
  now: Date,
  slaMinutes: number,
): boolean {
  if (!row.urgent || row.status !== "submitted" || row.assignedAdminId) return false;
  const filed = Date.parse(row.filedAt);
  return Number.isFinite(filed) && now.getTime() - filed > slaMinutes * 60_000;
}

/** The author block for one row, anonymity respected for the caller's tier. */
export function incidentAuthorRef(
  row: { userId: string | null; displayName: string | null; anonymous: boolean },
  access: IncidentAccess,
): IncidentAuthorRef | null {
  if (!row.userId) return null;
  if (row.anonymous && !access.seesAnonymousIdentity) {
    return { id: null, displayName: "Anonymous", anonymous: true, identityHidden: true };
  }
  return { id: row.userId, displayName: row.displayName ?? "", anonymous: row.anonymous, identityHidden: false };
}

/** The workflow buttons the incident's state allows (§9.1, §9.2). */
export function incidentActionsFor(state: { status: string; moderationState: string }): IncidentActions {
  const approved = state.moderationState === "approved";
  const deactivated = state.moderationState === "deactivated";
  const open = state.status === "submitted" || state.status === "under_review";
  return {
    verify: approved && open,
    dismiss: approved && open,
    reopen: approved && state.status === "dismissed",
    deactivate: !deactivated,
    reactivate: deactivated,
    assign: true,
    resolveModerationFirst: !approved && !deactivated,
  };
}

export type ReactivationPlan =
  | { state: "approved" }
  | { state: "pending"; trigger: Extract<RunTrigger, "manual" | "resubmitted"> };

/**
 * What Reactivate restores (§9.1, D10): `approved` iff the report was approved
 * when it was taken down and its content has not changed since; a private
 * report is approved outright (D3 — never queued); anything else goes back to
 * a check. A report a human had *rejected* goes back as `resubmitted` — always
 * held for a human — so reactivation can never let the AI undo a rejection
 * (D19). The service upgrades `manual` to `resubmitted` as well when the report
 * is still owed a resubmission check.
 */
export function reactivationPlan(input: {
  preState: string | null | undefined;
  preVersion: number | null | undefined;
  contentVersion: number;
  moderated: boolean;
}): ReactivationPlan {
  if (!input.moderated) return { state: "approved" };
  if (input.preState === "approved" && input.preVersion === input.contentVersion) return { state: "approved" };
  if (input.preState === "rejected") return { state: "pending", trigger: "resubmitted" };
  return { state: "pending", trigger: "manual" };
}

/**
 * Cut a fully built detail down to what the caller's tier may see (§9.1):
 * staff lose the body and the exact coordinates; tiers without the email lose
 * the author's email; an anonymous author becomes "Anonymous" for tiers without
 * anonymous identity. Evidence in the detail never carries URLs, and the
 * evidence endpoint refuses content-less tiers itself.
 */
export function redactIncidentDetail(detail: IncidentDetail, access: IncidentAccess): IncidentDetail {
  const report: IncidentReportView = { ...detail.report, location: { ...detail.report.location } };
  if (!access.seesContent) {
    report.body = null;
    report.bodyUnreadable = false;
    report.contentRedacted = true;
    report.location.exactLat = null;
    report.location.exactLng = null;
  }

  let author: IncidentAuthorView | null = detail.author ? { ...detail.author } : null;
  if (author) {
    if (author.anonymous && !access.seesAnonymousIdentity) {
      author = {
        id: null,
        displayName: "Anonymous",
        anonymous: true,
        identityHidden: true,
        email: null,
        status: null,
        memberSince: null,
      };
    } else if (!access.seesAuthorEmail) {
      author.email = null;
    }
  }
  return { ...detail, access, report, author };
}

/** What the lifecycle prints for an event. */
export function timelineLabel(action: string, metadata: Record<string, unknown> | null): string {
  const after = moderationStateIn(metadata, "after");
  const before = moderationStateIn(metadata, "before");
  switch (action) {
    case "status.submitted":
      return "Incident submitted";
    case "status.under_review":
      return "Moved to under review";
    case "status.verified":
      return "Marked verified";
    case "status.dismissed":
      return "Dismissed";
    case "report.edit":
      return "Edited by the author";
    case "report.resubmit":
      return "Resubmitted by the author after a rejection";
    case "report.delete":
      return "Deleted by the author";
    case "moderation.auto_approve":
      return after === "approved" && before !== "approved"
        ? "Published after the automated check"
        : "Automated check cleared new files";
    case "moderation.hold":
      return after === "held" && before !== "held"
        ? "Held for a moderator by the automated check"
        : "Automated check sent files to Media Review";
    case "moderation.auto_hide":
      return "Hidden for review after user flags";
    case "moderation.keep":
      return "Automated re-check found no violation";
    case "moderation.rerun":
      return "Sent back through the AI check";
    case "moderation.approve":
      return before === "approved" ? "Kept published by a moderator" : "Approved and published by a moderator";
    case "moderation.reject":
      return before === "approved" ? "Rejected and taken down by a moderator" : "Rejected by a moderator";
    case "moderation.supersede":
      return "Moderation case closed by deactivation";
    case "moderation.withdraw":
      return "Moderation case withdrawn";
    case "evidence.approve":
      return "Evidence approved";
    case "evidence.reject":
      return "Evidence file hidden from members";
    case "incident.deactivate":
      return "Deactivated and taken down from public view";
    case "incident.reactivate":
      return after === "approved" ? "Reactivated and published again" : "Reactivated and sent back for a check";
    case "incident.assign":
      return "Assignment changed";
    default:
      return action;
  }
}

function moderationStateIn(metadata: Record<string, unknown> | null, key: "before" | "after"): string | null {
  const value = metadata?.[key];
  if (value && typeof value === "object") {
    const state = (value as { moderationState?: unknown }).moderationState;
    return typeof state === "string" ? state : null;
  }
  return null;
}

// ── Dashboard metrics (`GET /metrics`) ───────────────────────────────────────

const METRICS_DAYS: Record<Exclude<IncidentMetricsRange, "12m">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const METRICS_MONTHS = 12;

/**
 * The window a metrics range covers, and every bucket in it. Buckets are UTC
 * calendar days (months for `12m`) ending with the current one, so "Last 7
 * Days" is today and the six days before it — a chart always ends on the
 * bucket in progress, and each bar covers one whole day. Timestamps on the
 * reports and audit rows are ISO UTC strings, so a bucket is a prefix of them.
 */
export function metricsWindow(
  range: IncidentMetricsRange,
  now: Date,
): { bucket: IncidentMetricsBucket; fromIso: string; keys: string[] } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (range === "12m") {
    // Date.UTC normalises a negative month into the year before.
    const keys = Array.from({ length: METRICS_MONTHS }, (_, index) =>
      new Date(Date.UTC(year, month - (METRICS_MONTHS - 1) + index, 1)).toISOString().slice(0, 10),
    );
    return { bucket: "month", fromIso: `${keys[0]}T00:00:00.000Z`, keys };
  }
  const days = METRICS_DAYS[range];
  const today = Date.UTC(year, month, now.getUTCDate());
  const keys = Array.from({ length: days }, (_, index) =>
    new Date(today - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
  return { bucket: "day", fromIso: `${keys[0]}T00:00:00.000Z`, keys };
}

/**
 * The metrics' scope over `reports r` — the list's access tier and nothing
 * else: an advocate counts only the incidents assigned to them, every other
 * tier counts every incident. Deleted reports are out, as everywhere in the
 * console; deactivated ones stay in (they were filed, published and held when
 * they were), and `byStatus` shows them in their own bucket.
 */
export function incidentMetricsScope(ctx: {
  access: IncidentAccess;
  adminId: string;
}): { clauses: string[]; replacements: Record<string, unknown> } {
  const clauses = ["r.deleted_at IS NULL"];
  const replacements: Record<string, unknown> = {};
  if (ctx.access.assignedOnly) {
    clauses.push("r.assigned_admin_id = :adminId");
    replacements.adminId = ctx.adminId;
  }
  return { clauses, replacements };
}

/** One `GROUP BY bucket` row: the timestamp prefix and its count. */
export interface MetricsBucketRow {
  bucket: string | null;
  n: number | string;
}

/**
 * Lay the three series onto the window's buckets. A month row's prefix is
 * `YYYY-MM` and becomes that month's key (`YYYY-MM-01`); a row outside the
 * window — a clock that ran ahead — is dropped rather than growing the chart.
 * The totals are the sums of what is drawn, so the legend and the bars agree.
 */
export function foldActivity(
  keys: readonly string[],
  bucket: IncidentMetricsBucket,
  series: { filed: readonly MetricsBucketRow[]; published: readonly MetricsBucketRow[]; held: readonly MetricsBucketRow[] },
): { activity: IncidentActivityPoint[]; totals: IncidentMetrics["totals"] } {
  const keyOf = (prefix: string): string => (bucket === "month" ? `${prefix.slice(0, 7)}-01` : prefix.slice(0, 10));
  const tally = (rows: readonly MetricsBucketRow[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.bucket) continue;
      const key = keyOf(row.bucket);
      counts.set(key, (counts.get(key) ?? 0) + (Number(row.n) || 0));
    }
    return counts;
  };
  const filed = tally(series.filed);
  const published = tally(series.published);
  const held = tally(series.held);

  const totals = { filed: 0, published: 0, held: 0 };
  const activity = keys.map((date): IncidentActivityPoint => {
    const point = {
      date,
      filed: filed.get(date) ?? 0,
      published: published.get(date) ?? 0,
      held: held.get(date) ?? 0,
    };
    totals.filed += point.filed;
    totals.published += point.published;
    totals.held += point.held;
    return point;
  });
  return { activity, totals };
}

/** One `GROUP BY category, status, deactivated` row over the reports filed in the range. */
export interface MetricsBreakdownRow {
  category: string;
  status: string;
  deactivated: boolean;
  n: number | string;
}

const BY_STATUS_KEYS = ["submitted", "under_review", "verified", "dismissed"] as const;

/**
 * The category distribution and the status split of the reports filed in the
 * range. All nine categories are returned, most first and ties in the C1
 * order, with the backend's labels; a category the union no longer knows is
 * counted as `other`, so the distribution still adds up to what was filed.
 */
export function foldCategoryStatus(rows: readonly MetricsBreakdownRow[]): {
  categories: IncidentCategoryCount[];
  byStatus: IncidentMetricsByStatus;
} {
  const counts = new Map<ReportCategory, number>(ALL_REPORT_CATEGORIES.map((category) => [category, 0]));
  const byStatus: IncidentMetricsByStatus = { submitted: 0, under_review: 0, verified: 0, dismissed: 0, deactivated: 0 };
  for (const row of rows) {
    const n = Number(row.n) || 0;
    const category: ReportCategory = counts.has(row.category as ReportCategory)
      ? (row.category as ReportCategory)
      : "other";
    counts.set(category, (counts.get(category) ?? 0) + n);
    if (row.deactivated) {
      byStatus.deactivated += n;
    } else if ((BY_STATUS_KEYS as readonly string[]).includes(row.status)) {
      byStatus[row.status as (typeof BY_STATUS_KEYS)[number]] += n;
    }
  }
  const order = new Map(ALL_REPORT_CATEGORIES.map((category, index) => [category, index]));
  const categories = ALL_REPORT_CATEGORIES.map(
    (category): IncidentCategoryCount => ({
      category,
      label: CATEGORY_LABELS[category],
      count: counts.get(category) ?? 0,
    }),
  ).sort((a, b) => b.count - a.count || (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0));
  return { categories, byStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RESOLVE_MODERATION_FIRST =
  "This incident isn't published yet. Resolve its moderation case in Content Moderation first.";
const REACTIVATE_FIRST = "This incident is deactivated. Reactivate it before changing its case status.";
const NOT_OPEN = "Only a submitted or under-review incident can be verified or dismissed.";

/** The audit actions the lifecycle shows (status events cover verify, dismiss, reopen). */
const TIMELINE_AUDIT_ACTIONS = [
  "report.edit",
  "report.resubmit",
  "report.delete",
  "moderation.auto_approve",
  "moderation.hold",
  "moderation.auto_hide",
  "moderation.keep",
  "moderation.approve",
  "moderation.reject",
  "moderation.rerun",
  "moderation.supersede",
  "moderation.withdraw",
  "evidence.approve",
  "evidence.reject",
  "incident.deactivate",
  "incident.reactivate",
  "incident.assign",
] as const;

/** Flags on a report that was taken down. */
const REPORT_TAKEN_DOWN: FlagClosure = {
  outcome: { status: "resolved", resolution: "The report was taken down by a moderator." },
  mail: {
    outcome: "Taken down",
    detail: "A moderator took the report down, so it is no longer visible to the community. Thank you for flagging it.",
  },
};

/** Flags on a comment whose report was taken down. */
const COMMENT_REPORT_TAKEN_DOWN: FlagClosure = {
  outcome: { status: "resolved", resolution: "The report it was posted on was taken down by a moderator." },
  mail: REPORT_TAKEN_DOWN.mail,
};

interface ListRow {
  id: string;
  case_ref: string;
  title: string;
  category: ReportCategory;
  location_label: string | null;
  status: ReportStatus;
  moderation_state: ReportModerationState;
  urgent: boolean;
  visibility: Visibility;
  filed_at: string;
  anonymous: boolean;
  user_id: string | null;
  assigned_admin_id: string | null;
  assigned_at: string | null;
  assignee_name: string | null;
  assignee_role: string | null;
  author_name: string | null;
  evidence_count: number;
  open_flags: number;
  open_case_id: string | null;
}

function roleLabel(role: string): string {
  return ADMIN_ROLE_LABELS[role as AdminRole] ?? role;
}

function assigneeRef(ref: AdminRef | undefined | null): IncidentAssigneeRef | null {
  return ref ? { id: ref.id, name: ref.name, role: ref.role, roleLabel: roleLabel(ref.role) } : null;
}

/**
 * Verify, Dismiss and Reopen move the case verdict of *published* content only
 * (§9.1, §9.2): 409 otherwise, worded for what the operator has to do first.
 * `transition` re-checks the same on the locked row (`requireModerationStates`).
 */
function assertPublished(report: Report): void {
  if (report.moderation_state === "approved") return;
  throw conflict(report.moderation_state === "deactivated" ? REACTIVATE_FIRST : RESOLVE_MODERATION_FIRST);
}

function snapshot(report: Report): { moderationState: ReportModerationState; status: ReportStatus } {
  return { moderationState: report.moderation_state, status: report.status };
}

// ─────────────────────────────────────────────────────────────────────────────
// The service
// ─────────────────────────────────────────────────────────────────────────────

class IncidentAdminService {
  // ── Reads ───────────────────────────────────────────────────────────────

  /** `GET /admin/incidents` — one page plus the total. */
  async list(actor: AdminActor, query: IncidentListQuery): Promise<{ items: IncidentListItem[]; total: number }> {
    const access = incidentAccessForActor(actor);
    const now = new Date();
    const { clauses, replacements } = incidentListWhere(query, { access, adminId: actor.id, now });
    const from = `FROM reports r
       LEFT JOIN admin_users a ON a.id = r.assigned_admin_id
       LEFT JOIN app_users u ON u.id = r.user_id AND u.deleted_on IS NULL
      WHERE ${clauses.join(" AND ")}`;
    const direction = query.sort === "oldest" ? "ASC" : "DESC";

    const [rows, counted] = await Promise.all([
      sequelize.query<ListRow>(
        `SELECT r.id, r.case_ref, r.title, r.category, r.location_label, r.status, r.moderation_state,
                r.urgent, r.visibility, r.filed_at, r.anonymous, r.user_id,
                r.assigned_admin_id, r.assigned_at,
                a.name AS assignee_name, a.role AS assignee_role,
                u.display_name AS author_name,
                (SELECT CAST(COUNT(*) AS integer) FROM report_evidence e
                  WHERE e.report_id = r.id AND e.upload_state = 'sealed') AS evidence_count,
                (SELECT CAST(COUNT(*) AS integer) FROM report_flags f
                  WHERE f.report_id = r.id AND f.comment_id IS NULL AND f.status = 'open') AS open_flags,
                (SELECT mc.id FROM moderation_cases mc
                  WHERE mc.target_type = 'report' AND mc.target_id = r.id AND mc.state = 'open'
                  LIMIT 1) AS open_case_id
           ${from}
          ORDER BY r.filed_at ${direction}, r.id ${direction}
          LIMIT :limit OFFSET :offset`,
        {
          replacements: { ...replacements, limit: query.limit, offset: (query.page - 1) * query.limit },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query<{ total: number }>(`SELECT CAST(COUNT(*) AS integer) AS total ${from}`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
    ]);

    const slaMinutes = env.reports.urgentSlaMinutes;
    const items = rows.map(
      (row): IncidentListItem => ({
        id: row.id,
        caseRef: row.case_ref,
        title: row.title,
        category: row.category,
        location: row.location_label,
        status: row.status,
        moderationState: row.moderation_state,
        displayStatus: displayStatusOf({
          moderationState: row.moderation_state,
          status: row.status,
          visibility: row.visibility,
        }),
        urgent: Boolean(row.urgent),
        slaBreached: isSlaBreached(
          { urgent: Boolean(row.urgent), status: row.status, assignedAdminId: row.assigned_admin_id, filedAt: row.filed_at },
          now,
          slaMinutes,
        ),
        visibility: row.visibility,
        submittedAt: row.filed_at,
        assignee:
          row.assigned_admin_id && row.assignee_role
            ? {
                id: row.assigned_admin_id,
                name: row.assignee_name ?? "",
                role: row.assignee_role,
                roleLabel: roleLabel(row.assignee_role),
              }
            : null,
        assignedAt: row.assigned_at,
        author: incidentAuthorRef(
          { userId: row.user_id, displayName: row.author_name, anonymous: Boolean(row.anonymous) },
          access,
        ),
        evidenceCount: Number(row.evidence_count) || 0,
        openFlags: Number(row.open_flags) || 0,
        openCaseId: row.open_case_id,
      }),
    );
    return { items, total: counted[0]?.total ?? 0 };
  }

  /**
   * `GET /admin/incidents/summary` — per-tab counts in the caller's scope
   * (advocates: their assignments), optionally for one `assignee` (the *My
   * Assigned Cases* page asks with `assignee=me`).
   */
  async summary(actor: AdminActor, query: { assignee?: string }): Promise<IncidentSummary> {
    const access = incidentAccessForActor(actor);
    const scope: string[] = ["r.deleted_at IS NULL"];
    const replacements: Record<string, unknown> = {
      adminId: actor.id,
      slaCutoff: new Date(Date.now() - env.reports.urgentSlaMinutes * 60_000).toISOString(),
    };
    if (access.assignedOnly || query.assignee === "me") {
      scope.push("r.assigned_admin_id = :adminId");
    } else if (query.assignee === "unassigned") {
      scope.push("r.assigned_admin_id IS NULL");
    } else if (query.assignee) {
      scope.push("r.assigned_admin_id = :assigneeId");
      replacements.assigneeId = query.assignee;
    }

    const live = "r.moderation_state <> 'deactivated'";
    const rows = await sequelize.query<Record<string, number>>(
      `SELECT CAST(COUNT(*) FILTER (WHERE ${live}) AS integer) AS "all",
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.status = 'submitted') AS integer) AS submitted,
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.status = 'under_review') AS integer) AS under_review,
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.status = 'verified') AS integer) AS verified,
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.status = 'dismissed') AS integer) AS dismissed,
              CAST(COUNT(*) FILTER (WHERE r.moderation_state = 'deactivated') AS integer) AS deactivated,
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.assigned_admin_id = :adminId) AS integer) AS assigned_to_me,
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.assigned_admin_id IS NULL) AS integer) AS unassigned,
              CAST(COUNT(*) FILTER (WHERE ${live} AND r.urgent) AS integer) AS urgent,
              CAST(COUNT(*) FILTER (WHERE r.urgent AND r.status = 'submitted' AND r.assigned_admin_id IS NULL
                                      AND r.filed_at < :slaCutoff) AS integer) AS sla_breached
         FROM reports r
        WHERE ${scope.join(" AND ")}`,
      { replacements, type: QueryTypes.SELECT },
    );
    const row = rows[0] ?? {};
    const n = (key: string): number => Number(row[key]) || 0;
    return {
      all: n("all"),
      submitted: n("submitted"),
      under_review: n("under_review"),
      verified: n("verified"),
      dismissed: n("dismissed"),
      deactivated: n("deactivated"),
      assignedToMe: n("assigned_to_me"),
      unassigned: n("unassigned"),
      urgent: n("urgent"),
      slaBreached: n("sla_breached"),
    };
  }

  /**
   * `GET /admin/incidents/metrics` — the dashboard's Incident Activity chart
   * and Incident Categories breakdown (plan §11 Phase 3C), in the caller's
   * scope (advocates: their assignments; see `incidentMetricsScope`).
   *
   *   filed      — reports by `filed_at`.
   *   published  — public/trusted reports by `published_at`: the first time
   *                they went live (D11 — never bumped by edits or a
   *                reactivation). A private report is "published" to its owner
   *                at filing and is not counted.
   *   held       — the audit rows where a report *moved into* `held`
   *                (`moderation.hold` / `moderation.auto_hide` whose recorded
   *                `after` state is held and `before` was not): the pipeline's
   *                holds, flag re-check auto-hides and the terminal fallback.
   *                An evidence-only run that sends files to Media Review while
   *                the report stays live is not a hold of the report, and the
   *                reconciler's "case missing" row (no state change) is not
   *                one either — the same reading the lifecycle labels use.
   *
   * Aggregates only: no titles, bodies or identities leave this method, so the
   * metadata tier (staff) sees the same figures as everyone in its scope.
   */
  async metrics(actor: AdminActor, query: { range: IncidentMetricsRange }): Promise<IncidentMetrics> {
    const access = incidentAccessForActor(actor);
    const now = new Date();
    const window = metricsWindow(query.range, now);
    const scope = incidentMetricsScope({ access, adminId: actor.id });
    const where = scope.clauses.join(" AND ");
    const replacements = { ...scope.replacements, fromIso: window.fromIso };
    // A bucket is a prefix of an ISO timestamp: `YYYY-MM-DD` or `YYYY-MM`.
    // A constant from the bucket kind, never input — safe to inline.
    const prefix = window.bucket === "month" ? 7 : 10;

    const [filed, published, held, breakdown] = await Promise.all([
      sequelize.query<MetricsBucketRow>(
        `SELECT LEFT(r.filed_at, ${prefix}) AS bucket, CAST(COUNT(*) AS integer) AS n
           FROM reports r
          WHERE ${where} AND r.filed_at >= :fromIso
          GROUP BY 1`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query<MetricsBucketRow>(
        `SELECT LEFT(r.published_at, ${prefix}) AS bucket, CAST(COUNT(*) AS integer) AS n
           FROM reports r
          WHERE ${where} AND r.visibility <> 'private' AND r.published_at >= :fromIso
          GROUP BY 1`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query<MetricsBucketRow>(
        `SELECT LEFT(a.at, ${prefix}) AS bucket, CAST(COUNT(*) AS integer) AS n
           FROM audit_events a
           JOIN reports r ON r.id = a.target_id
          WHERE ${where}
            AND a.target_type = 'report'
            AND a.action IN ('moderation.hold', 'moderation.auto_hide')
            AND a.at >= :fromIso
            AND a.metadata -> 'after' ->> 'moderationState' = 'held'
            AND (a.metadata -> 'before' ->> 'moderationState') IS DISTINCT FROM 'held'
          GROUP BY 1`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query<MetricsBreakdownRow>(
        `SELECT r.category, r.status, (r.moderation_state = 'deactivated') AS deactivated,
                CAST(COUNT(*) AS integer) AS n
           FROM reports r
          WHERE ${where} AND r.filed_at >= :fromIso
          GROUP BY 1, 2, 3`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const { activity, totals } = foldActivity(window.keys, window.bucket, { filed, published, held });
    const { categories, byStatus } = foldCategoryStatus(breakdown);
    return {
      range: query.range,
      bucket: window.bucket,
      from: window.fromIso,
      activity,
      totals,
      categories,
      byStatus,
      generatedAt: now.toISOString(),
    };
  }

  /** `GET /admin/incidents/assignees` — active moderators and advocates (D17). */
  async assignees(): Promise<AssigneeOption[]> {
    const admins = await AdminUser.findAll({
      where: { is_active: true, role: { [Op.in]: ["moderator", "advocate"] } },
      attributes: ["id", "name", "email", "role"],
      order: [["name", "ASC"]],
    });
    if (admins.length === 0) return [];
    const counts = await sequelize.query<{ assigned_admin_id: string; n: number }>(
      `SELECT assigned_admin_id, CAST(COUNT(*) AS integer) AS n
         FROM reports
        WHERE deleted_at IS NULL AND moderation_state <> 'deactivated'
          AND status IN ('submitted', 'under_review') AND assigned_admin_id IN (:ids)
        GROUP BY assigned_admin_id`,
      { replacements: { ids: admins.map((row) => row.id) }, type: QueryTypes.SELECT },
    );
    const open = new Map(counts.map((row) => [row.assigned_admin_id, row.n]));
    return admins.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as "moderator" | "advocate",
      roleLabel: roleLabel(row.role),
      openAssigned: open.get(row.id) ?? 0,
    }));
  }

  /** `GET /admin/incidents/:id` — per access tier. */
  async detail(actor: AdminActor, reportId: string): Promise<IncidentDetail> {
    const { report, access } = await loadIncidentFor(actor, reportId);

    const [reportView, owner, statusEvents, audits, notes, openCase, openFlags, flags, corroborations] =
      await Promise.all([
        buildAdminReportView(report),
        report.user_id
          ? (AppUser.findByPk(report.user_id, {
              attributes: ["id", "display_name", "email", "status", "created_on"],
              raw: true,
            }) as unknown as Promise<{
              id: string;
              display_name: string | null;
              email: string;
              status: UserStatus;
              created_on: unknown;
            } | null>)
          : Promise.resolve(null),
        ReportStatusEvent.findAll({ where: { report_id: report.id }, order: [["at", "ASC"]] }),
        AuditEvent.findAll({
          where: {
            report_id: report.id,
            target_type: { [Op.in]: ["report", "evidence"] },
            action: { [Op.in]: [...TIMELINE_AUDIT_ACTIONS] },
          },
          order: [["at", "ASC"]],
        }),
        ReportNote.findAll({ where: { report_id: report.id }, order: [["created_at", "DESC"]] }),
        moderationCaseService.findOpenCase(null, "report", report.id),
        ReportFlag.count({ where: { report_id: report.id, comment_id: null, status: "open" } }),
        ReportFlag.count({ where: { report_id: report.id, comment_id: null } }),
        ReportCorroboration.findAll({ where: { report_id: report.id }, attributes: ["has_evidence"] }),
      ]);

    const verifiedEvent = [...statusEvents].reverse().find((event) => event.status === "verified");
    const assigneeIds = audits
      .filter((row) => row.action === "incident.assign")
      .map((row) => assigneeIdIn(row.metadata, "after"));
    const refs = await loadAdminRefs([
      report.assigned_admin_id,
      report.assigned_by,
      verifiedEvent?.actor_kind === "moderator" ? verifiedEvent.actor_id : null,
      ...statusEvents.filter((row) => row.actor_kind === "moderator").map((row) => row.actor_id),
      ...audits.filter((row) => row.actor_kind === "admin").map((row) => row.actor_id),
      ...notes.map((row) => row.admin_id),
      ...assigneeIds,
    ]);

    // Sealed files only — an upload still in flight (or one that failed) is not
    // evidence yet, and the member-facing D3 score counts the same set.
    const sealed = reportView.evidence.filter((row) => row.uploadState === "sealed");
    const strength = evidenceStrengthService.evaluate({
      evidence: sealed.map((row) => ({ kind: row.kind, capturedAt: row.capturedAt, deviceId: null })),
      occurredAt: report.occurred_at,
      corroborationCount: corroborations.length,
      corroboratedWithEvidence: corroborations.some((row) => row.has_evidence),
    });

    const plan =
      report.moderation_state === "deactivated"
        ? reactivationPlan({
            preState: report.pre_deactivation_state,
            preVersion: report.pre_deactivation_version,
            contentVersion: report.content_version,
            moderated: needsModeration(report),
          })
        : null;

    const assigned = report.assigned_admin_id ? refs.get(report.assigned_admin_id) : undefined;
    const full: IncidentDetail = {
      access,
      report: { ...reportView, contentRedacted: false },
      author: owner
        ? {
            id: owner.id,
            displayName: owner.display_name ?? "",
            anonymous: Boolean(report.anonymous),
            identityHidden: false,
            email: owner.email,
            status: owner.status,
            memberSince: isoOf(owner.created_on),
          }
        : null,
      assignee: assigned
        ? {
            ...(assigneeRef(assigned) as IncidentAssigneeRef),
            assignedAt: report.assigned_at ?? null,
            assignedBy: report.assigned_by ? refs.get(report.assigned_by) ?? null : null,
          }
        : null,
      moderation: {
        state: report.moderation_state,
        displayStatus: reportView.displayStatus,
        reasonCode: report.moderation_reason ?? null,
        reasonLabel: ownerReasonLabel(report.moderation_state, report.moderation_reason),
        note: report.moderation_note ?? null,
        moderatedAt: report.moderated_at ?? null,
        openCaseId: openCase?.id ?? null,
        preDeactivationState: report.pre_deactivation_state ?? null,
        reactivateRestores: plan ? plan.state : null,
      },
      verifiedBy:
        verifiedEvent?.actor_kind === "moderator" && verifiedEvent.actor_id
          ? refs.get(verifiedEvent.actor_id) ?? null
          : null,
      verifiedAt: report.verified_at ?? null,
      timeline: this.timeline(statusEvents, audits, refs),
      notes: notes.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        author: refs.get(row.admin_id) ?? null,
      })),
      counts: {
        evidence: sealed.length,
        openFlags,
        flags,
        comments: report.comment_count,
        supports: report.support_count,
        corroborations: report.corroboration_count,
        notes: notes.length,
      },
      evidenceStrength: { strength: strength.strength, rationale: strength.rationale },
      actions: incidentActionsFor({ status: report.status, moderationState: report.moderation_state }),
    };
    return redactIncidentDetail(full, access);
  }

  /** `GET /admin/incidents/:id/evidence/:evidenceId` — a sealed file of this incident, for content tiers. */
  async evidenceUrl(actor: AdminActor, reportId: string, evidenceId: string): Promise<EvidenceLink> {
    const { report } = await loadIncidentFor(actor, reportId, { requireContent: true });
    const row = await ReportEvidence.findOne({ where: { id: evidenceId, report_id: report.id } });
    if (!row || row.upload_state !== "sealed") throw notFound("That file is not available on this incident.");
    return evidenceLinkFor(row);
  }

  // ── Case-status decisions ───────────────────────────────────────────────

  /**
   * `POST /:id/verify` — requires published and submitted/under review. The
   * note is internal.
   *
   * Review Q20 (the prototype's `verify_incident_confirm`): an *unassigned*
   * incident is first assigned to the operator verifying it — so it shows
   * under their *My Assigned Cases* and leaves the `unassigned` count — when
   * they are an active moderator or advocate, the roles `assign` accepts
   * (D17). A superadmin verifier leaves it unassigned: they are not an
   * assignee. The assignment is written and audited (`incident.assign`) in
   * this transaction, before the status moves; an incident already assigned
   * to someone else keeps its assignee.
   */
  async verify(actor: AdminActor, reportId: string, input: { note?: string | null }): Promise<IncidentStateView> {
    const pendingPushes: PendingPush[] = [];
    const result = await adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx, lock: true });
      await this.assertNotAuthor(tx, actor, report, "incident.verify");
      assertPublished(report);
      if (report.status !== "submitted" && report.status !== "under_review") throw conflict(NOT_OPEN);

      const assignedToVerifier = await this.assignVerifierIfUnassigned(tx, actor, report);
      const before = snapshot(report);
      const updated = await reportService.transition(
        report,
        "verified",
        { kind: "moderator", id: actor.id },
        { transaction: tx, pendingPushes, requireModerationStates: ["approved"] },
      );
      const noteId = await this.addInternalNote(tx, actor, report.id, input.note);
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.verify",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        note: input.note ?? null,
        metadata: { before, after: snapshot(updated), noteId, assignedToVerifier },
        ip: actor.ip,
      });
      return this.stateView(updated, tx);
    });
    notificationService.dispatchPushes(pendingPushes);
    logger.info("[incidents] verified", { reportId, adminId: actor.id });
    return result;
  }

  /** `POST /:id/dismiss` — requires published; the author sees the label and the public note. */
  async dismiss(
    actor: AdminActor,
    reportId: string,
    input: { reasonCode: DismissReasonCode; publicNote?: string | null; internalNote?: string | null },
  ): Promise<IncidentStateView> {
    assertReason("dismiss", input.reasonCode, input.publicNote);
    const publicNote = input.publicNote?.trim() || null;
    const pendingPushes: PendingPush[] = [];
    const result = await adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx, lock: true });
      await this.assertNotAuthor(tx, actor, report, "incident.dismiss");
      assertPublished(report);
      if (report.status !== "submitted" && report.status !== "under_review") throw conflict(NOT_OPEN);

      const before = snapshot(report);
      // The status event's note is the author-facing one (their timeline shows
      // it with the reason label); the internal note goes to report_notes.
      const updated = await reportService.transition(
        report,
        "dismissed",
        { kind: "moderator", id: actor.id },
        {
          transaction: tx,
          pendingPushes,
          note: publicNote,
          reasonCode: input.reasonCode,
          requireModerationStates: ["approved"],
        },
      );
      const noteId = await this.addInternalNote(tx, actor, report.id, input.internalNote);
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.dismiss",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        reasonCode: input.reasonCode,
        note: input.internalNote ?? null,
        metadata: {
          before,
          after: snapshot(updated),
          reasonLabel: dismissReasonLabel(input.reasonCode),
          publicNote: publicNote !== null,
          noteId,
        },
        ip: actor.ip,
      });
      return this.stateView(updated, tx);
    });
    notificationService.dispatchPushes(pendingPushes);
    logger.info("[incidents] dismissed", { reportId, reason: input.reasonCode, adminId: actor.id });
    return result;
  }

  /** `POST /:id/reopen` — dismissed → under review (D20). The note is required and internal. */
  async reopen(actor: AdminActor, reportId: string, input: { note: string }): Promise<IncidentStateView> {
    if (!input.note || !input.note.trim()) throw badRequest("Say why the case is being reopened.");
    const pendingPushes: PendingPush[] = [];
    const result = await adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx, lock: true });
      await this.assertNotAuthor(tx, actor, report, "incident.reopen");
      assertPublished(report);
      if (report.status !== "dismissed") throw conflict("Only a dismissed incident can be reopened.");

      const before = snapshot(report);
      // `transition` words it "Your report is being reviewed again" (from dismissed).
      const updated = await reportService.transition(
        report,
        "under_review",
        { kind: "moderator", id: actor.id },
        { transaction: tx, pendingPushes, requireModerationStates: ["approved"] },
      );
      const noteId = await this.addInternalNote(tx, actor, report.id, input.note);
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.reopen",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        note: input.note,
        metadata: { before, after: snapshot(updated), noteId },
        ip: actor.ip,
      });
      return this.stateView(updated, tx);
    });
    notificationService.dispatchPushes(pendingPushes);
    logger.info("[incidents] reopened", { reportId, adminId: actor.id });
    return result;
  }

  // ── Publication decisions (D10) ─────────────────────────────────────────

  /**
   * `POST /:id/deactivate` — from any state. Supersedes every open moderation
   * case on the report and its comments, cancels their queued runs, resolves
   * their flags (reporters emailed after the commit), and tells the author.
   *
   * D16 covers the report's author and — because every one of those cases is
   * closed as this operator — their flaggers and the comments' authors
   * (review Q4). The comments themselves keep their state (review Q8): a
   * pending or held comment stays so, and nothing reopens work on it while
   * the report is deactivated — the run guard drops comment runs on a
   * deactivated report, the reconciler skips its comments, and new comment
   * flags are refused. Reactivate hands them back to the reconciler, which
   * queues their runs and reopens their cases as for any other comment.
   */
  async deactivate(
    actor: AdminActor,
    reportId: string,
    input: { reasonCode: DeactivateReasonCode; publicNote?: string | null; internalNote?: string | null },
  ): Promise<IncidentStateView> {
    assertReason("deactivate", input.reasonCode, input.publicNote);
    const publicNote = input.publicNote?.trim() || null;
    const label = deactivateReasonLabel(input.reasonCode);
    const pendingPushes: PendingPush[] = [];
    const flags: ResolvedFlagRow[] = [];

    const result = await adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx, lock: true });
      await this.assertNotAuthor(tx, actor, report, "incident.deactivate");
      if (report.moderation_state === "deactivated") throw conflict("This incident is already deactivated.");
      const before = snapshot(report);

      // Report row held; now its comments' cases and flags, then its own —
      // target → case → flags, the order every writer takes (§5.4).
      const commentTargets = await sequelize.query<{ target_id: string }>(
        `SELECT target_id FROM moderation_cases
          WHERE report_id = :reportId AND target_type = 'comment' AND state = 'open'
         UNION
         SELECT f.comment_id AS target_id
           FROM report_flags f
           JOIN report_comments c ON c.id = f.comment_id
          WHERE c.report_id = :reportId AND f.status = 'open'`,
        { replacements: { reportId: report.id }, type: QueryTypes.SELECT, transaction: tx },
      );
      // Review Q4: deactivation closes every one of those cases and resolves
      // their flags as this operator, so D16 covers everyone a moderation
      // decision on them would have: the members who flagged the report or
      // those comments, and the comments' authors — not just the report's
      // author. Otherwise an operator refused "You flagged this yourself" on
      // the case could reach the same outcome here, unaudited. Checked before
      // any write, so a refusal rolls back and is recorded like the others.
      await this.assertNotInvolved(
        tx,
        actor,
        report,
        commentTargets.map((row) => row.target_id),
        "incident.deactivate",
      );
      let casesSuperseded = 0;
      for (const { target_id: commentId } of commentTargets) {
        const closed = await moderationCaseService.closeForTarget(tx, {
          targetType: "comment",
          targetId: commentId,
          resolution: "superseded",
          flagOutcome: { ...COMMENT_REPORT_TAKEN_DOWN.outcome, resolvedBy: actor.id },
          resolvedBy: actor.id,
        });
        flags.push(...closed.flags);
        if (closed.closedCase) {
          casesSuperseded += 1;
          await this.recordSupersede(tx, actor, closed.closedCase.id, "comment", commentId, report.id, closed.flags.length);
        }
      }
      const own = await moderationCaseService.closeForTarget(tx, {
        targetType: "report",
        targetId: report.id,
        resolution: "superseded",
        flagOutcome: { ...REPORT_TAKEN_DOWN.outcome, resolvedBy: actor.id },
        resolvedBy: actor.id,
      });
      flags.push(...own.flags);
      if (own.closedCase) {
        casesSuperseded += 1;
        await this.recordSupersede(tx, actor, own.closedCase.id, "report", report.id, report.id, own.flags.length);
      }
      // Comment runs carry their report's id: one statement withdraws them all.
      const runsCancelled = await cancelRunsForReport(tx, report.id);

      await report.update(
        {
          moderation_state: "deactivated",
          moderation_reason: input.reasonCode,
          moderation_note: publicNote,
          moderated_at: nowIso(),
          pre_deactivation_state: before.moderationState,
          pre_deactivation_version: report.content_version,
        },
        { transaction: tx },
      );
      if (report.user_id) {
        await notificationService.createInTx(
          tx,
          {
            userId: report.user_id,
            type: OWNER_NOTIFICATIONS.takenDown.type,
            title: OWNER_NOTIFICATIONS.takenDown.title,
            body: label
              ? `Reason: ${label}. ${OWNER_NOTIFICATIONS.takenDown.body}`
              : OWNER_NOTIFICATIONS.takenDown.body,
            link: `/r/${report.case_ref}`,
            reportId: report.id,
          },
          pendingPushes,
        );
      }
      const noteId = await this.addInternalNote(tx, actor, report.id, input.internalNote);
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.deactivate",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        reasonCode: input.reasonCode,
        note: input.internalNote ?? null,
        metadata: {
          before,
          after: { moderationState: "deactivated", status: report.status },
          contentVersion: report.content_version,
          casesSuperseded,
          runsCancelled,
          flagsResolved: flags.length,
          publicNote: publicNote !== null,
          noteId,
        },
        ip: actor.ip,
      });
      return this.stateView(report, tx);
    });

    notificationService.dispatchPushes(pendingPushes);
    const reportFlags = flags.filter((flag) => !flag.comment_id);
    const commentFlags = flags.filter((flag) => Boolean(flag.comment_id));
    flagService.notifyReporters(reportFlags, REPORT_TAKEN_DOWN.mail);
    flagService.notifyReporters(commentFlags, COMMENT_REPORT_TAKEN_DOWN.mail);
    logger.info("[incidents] deactivated", { reportId, reason: input.reasonCode, adminId: actor.id });
    return result;
  }

  /**
   * `POST /:id/reactivate` — `approved` when it was approved and unchanged,
   * otherwise back to a check (see `reactivationPlan`).
   */
  async reactivate(actor: AdminActor, reportId: string, input: { note?: string | null }): Promise<IncidentStateView> {
    const pendingPushes: PendingPush[] = [];
    let queued = false;

    const result = await adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx, lock: true });
      await this.assertNotAuthor(tx, actor, report, "incident.reactivate");
      if (report.moderation_state !== "deactivated") throw conflict("Only a deactivated incident can be reactivated.");

      const before = snapshot(report);
      const plan = reactivationPlan({
        preState: report.pre_deactivation_state,
        preVersion: report.pre_deactivation_version,
        contentVersion: report.content_version,
        moderated: needsModeration(report),
      });
      const now = nowIso();
      let runId: string | null = null;
      let trigger: RunTrigger | null = null;

      if (plan.state === "approved") {
        const everPublished = Boolean(report.published_at);
        await report.update(
          {
            moderation_state: "approved",
            moderation_reason: null,
            moderation_note: null,
            moderated_at: now,
            approved_content_version: report.content_version,
            published_at: report.published_at ?? now,
            pre_deactivation_state: null,
            pre_deactivation_version: null,
          },
          { transaction: tx },
        );
        // A private report is "published" to nobody — its owner hears nothing.
        if (report.user_id && needsModeration(report)) {
          const copy = everPublished ? OWNER_NOTIFICATIONS.liveAgain : OWNER_NOTIFICATIONS.live;
          await notificationService.createInTx(
            tx,
            {
              userId: report.user_id,
              type: copy.type,
              title: copy.title,
              body: copy.body,
              link: `/r/${report.case_ref}`,
              reportId: report.id,
            },
            pendingPushes,
          );
        }
      } else {
        await report.update(
          {
            moderation_state: "pending",
            moderation_reason: null,
            moderation_note: null,
            moderated_at: now,
            pre_deactivation_state: null,
            pre_deactivation_version: null,
            // Review Q7: a rejected report comes back owing a human check, and
            // that debt must outlive this one run — a later edit, *Re-run AI*,
            // late file or reconciler run must hold for a human too. The
            // `resubmitted` run queued below plus no approved version is what
            // `awaitsResubmissionCheck` reads. A rejection clears the approved
            // version itself now; this covers rows rejected before it did (a
            // report rejected while live still carried its live version).
            ...(plan.trigger === "resubmitted" ? { approved_content_version: null } : {}),
          },
          { transaction: tx },
        );
        // D19: a report still owed its resubmission check is queued as one.
        trigger =
          plan.trigger === "resubmitted" || (await awaitsResubmissionCheck(tx, report)) ? "resubmitted" : "manual";
        const urgent = Boolean(report.urgent);
        runId = await enqueueRun(tx, {
          targetType: "report",
          targetId: report.id,
          reportId: report.id,
          contentVersion: report.content_version,
          trigger,
          priority: urgent ? RUN_PRIORITY.urgent : RUN_PRIORITY.manual,
          maxAttempts: maxAttemptsFor(urgent),
        });
        queued = true;
      }

      const noteId = await this.addInternalNote(tx, actor, report.id, input.note);
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.reactivate",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        note: input.note ?? null,
        metadata: {
          before,
          after: { moderationState: plan.state, status: report.status },
          restored: plan.state === "approved",
          contentVersion: report.content_version,
          runId,
          trigger,
          noteId,
        },
        ip: actor.ip,
      });
      return { ...(await this.stateView(report, tx)), runId };
    });

    notificationService.dispatchPushes(pendingPushes);
    if (queued) pokeModeration();
    logger.info("[incidents] reactivated", {
      reportId,
      restored: result.moderationState === "approved",
      adminId: actor.id,
    });
    return result;
  }

  // ── Assignment and notes ────────────────────────────────────────────────

  /**
   * `POST /:id/assign` — `adminId` null unassigns. Assigning an approved
   * `submitted` incident moves it to `under_review` (D17); anything else is an
   * assignment only.
   */
  async assign(actor: AdminActor, reportId: string, input: { adminId: string | null }): Promise<IncidentStateView> {
    const pendingPushes: PendingPush[] = [];
    const result = await adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx, lock: true });
      await this.assertNotAuthor(tx, actor, report, "incident.assign");

      let assignee: AdminUser | null = null;
      if (input.adminId) {
        assignee = await AdminUser.findOne({
          where: { id: input.adminId, is_active: true, role: { [Op.in]: ["moderator", "advocate"] } },
          attributes: ["id", "name", "email", "role"],
          transaction: tx,
        });
        if (!assignee) throw badRequest("Choose an active moderator or advocate to assign the case to.");
        if (report.user_id) {
          const author = await AppUser.findByPk(report.user_id, {
            attributes: ["id", "email"],
            paranoid: false,
            transaction: tx,
          });
          // D16's rule, applied to the assignee: the person who filed an
          // incident cannot be the one who works it.
          if (author && normaliseEmail(author.email) !== null && normaliseEmail(author.email) === normaliseEmail(assignee.email)) {
            throw badRequest("That person filed this incident, so it can't be assigned to them.");
          }
        }
      }

      const current = report.assigned_admin_id ?? null;
      const next = assignee?.id ?? null;
      if (current === next) return { ...(await this.stateView(report, tx)), changed: false };

      const before = { assigneeId: current, ...snapshot(report) };
      const now = nowIso();
      await report.update(
        {
          assigned_admin_id: next,
          assigned_at: next ? now : null,
          assigned_by: next ? actor.id : null,
        },
        { transaction: tx },
      );
      let updated = report;
      if (next && report.moderation_state === "approved" && report.status === "submitted") {
        updated = await reportService.transition(
          report,
          "under_review",
          { kind: "moderator", id: actor.id },
          { transaction: tx, pendingPushes, requireModerationStates: ["approved"] },
        );
      }
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.assign",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        metadata: {
          before,
          after: { assigneeId: next, ...snapshot(updated) },
          assigneeRole: assignee?.role ?? null,
        },
        ip: actor.ip,
      });
      return this.stateView(updated, tx);
    });
    notificationService.dispatchPushes(pendingPushes);
    logger.info("[incidents] assignment changed", {
      reportId,
      assigneeId: input.adminId,
      changed: result.changed,
      adminId: actor.id,
    });
    return result;
  }

  /** `POST /:id/notes` — an internal note. Staff-only by construction (§4.7). */
  async addNote(actor: AdminActor, reportId: string, input: { body: string }): Promise<IncidentNoteView> {
    const body = input.body.trim();
    if (!body) throw badRequest("Write the note first.");
    return adminTransaction(async (tx) => {
      const { report } = await loadIncidentFor(actor, reportId, { transaction: tx });
      await this.assertNotAuthor(tx, actor, report, "incident.note");
      const note = await ReportNote.create(
        { report_id: report.id, admin_id: actor.id, body, created_at: nowIso() },
        { transaction: tx },
      );
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "incident.note",
        targetType: "report",
        targetId: report.id,
        reportId: report.id,
        // The note itself lives in report_notes; the log records that it exists.
        metadata: { noteId: note.id, length: body.length },
        ip: actor.ip,
      });
      const refs = await loadAdminRefs([actor.id], tx);
      return { id: note.id, body: note.body, createdAt: note.created_at, author: refs.get(actor.id) ?? null };
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** D16 for incident actions: the author only (flags belong to moderation cases). */
  private async assertNotAuthor(
    tx: Transaction,
    actor: AdminActor,
    report: Report,
    action: Parameters<typeof assertNotSelf>[2]["action"],
  ): Promise<void> {
    await assertNotSelf(tx, actor, {
      action,
      targetType: "report",
      targetId: report.id,
      reportId: report.id,
      authorIds: [report.user_id ?? null],
    });
  }

  /**
   * Verify's auto-assignment (review Q20). The role is read from the admin row
   * in this transaction, exactly as `assign` checks an assignee — a token's
   * role claim may be stale — and D16's "the person who filed it cannot work
   * it" already held (`assertNotAuthor` ran first). Returns true when it
   * assigned.
   */
  private async assignVerifierIfUnassigned(tx: Transaction, actor: AdminActor, report: Report): Promise<boolean> {
    if (report.assigned_admin_id) return false;
    const verifier = await AdminUser.findOne({
      where: { id: actor.id, is_active: true, role: { [Op.in]: ["moderator", "advocate"] } },
      attributes: ["id", "role"],
      transaction: tx,
    });
    if (!verifier) return false;

    const before = { assigneeId: null, ...snapshot(report) };
    await report.update(
      { assigned_admin_id: verifier.id, assigned_at: nowIso(), assigned_by: actor.id },
      { transaction: tx },
    );
    await auditService.record(tx, {
      actorKind: "admin",
      actorId: actor.id,
      action: "incident.assign",
      targetType: "report",
      targetId: report.id,
      reportId: report.id,
      metadata: {
        before,
        after: { assigneeId: verifier.id, ...snapshot(report) },
        assigneeRole: verifier.role,
        by: "incident.verify",
      },
      ip: actor.ip,
    });
    return true;
  }

  /**
   * D16 for a decision that closes moderation work on the report and some of
   * its comments (deactivation, review Q4): the members who flagged the report
   * (on its open case, or with a flag still open) or any of `commentIds`, and
   * the authors of those comments. The report's author is checked separately,
   * first (`assertNotAuthor`), so the refusal names the most serious relation.
   * Reads only — call it before the decision writes anything.
   */
  private async assertNotInvolved(
    tx: Transaction,
    actor: AdminActor,
    report: Report,
    commentIds: readonly string[],
    action: Parameters<typeof assertNotSelf>[2]["action"],
  ): Promise<void> {
    const ids = [...new Set(commentIds.filter(Boolean))];
    const hasComments = ids.length > 0;
    const [flaggers, commentAuthors] = await Promise.all([
      sequelize.query<{ reporter_id: string }>(
        `SELECT DISTINCT f.reporter_id
           FROM report_flags f
          WHERE f.reporter_id IS NOT NULL
            AND ((f.report_id = :reportId AND f.comment_id IS NULL
                  AND (f.status = 'open'
                       OR f.case_id IN (SELECT mc.id FROM moderation_cases mc
                                         WHERE mc.target_type = 'report' AND mc.target_id = :reportId
                                           AND mc.state = 'open')))
                 ${
                   hasComments
                     ? `OR (f.comment_id IN (:commentIds)
                            AND (f.status = 'open'
                                 OR f.case_id IN (SELECT mc.id FROM moderation_cases mc
                                                   WHERE mc.target_type = 'comment' AND mc.target_id IN (:commentIds)
                                                     AND mc.state = 'open')))`
                     : ""
                 })`,
        {
          replacements: { reportId: report.id, ...(hasComments ? { commentIds: ids } : {}) },
          type: QueryTypes.SELECT,
          transaction: tx,
        },
      ),
      hasComments
        ? sequelize.query<{ user_id: string | null }>(
            `SELECT DISTINCT user_id FROM report_comments WHERE id IN (:commentIds)`,
            { replacements: { commentIds: ids }, type: QueryTypes.SELECT, transaction: tx },
          )
        : Promise.resolve([] as { user_id: string | null }[]),
    ]);
    await assertNotSelf(tx, actor, {
      action,
      targetType: "report",
      targetId: report.id,
      reportId: report.id,
      authorIds: commentAuthors.map((row) => row.user_id),
      flaggerIds: flaggers.map((row) => row.reporter_id),
    });
  }

  /** Store a decision's internal note in `report_notes`, when there is one. */
  private async addInternalNote(
    tx: Transaction,
    actor: AdminActor,
    reportId: string,
    note: string | null | undefined,
  ): Promise<string | null> {
    const body = typeof note === "string" ? note.trim() : "";
    if (!body) return null;
    const row = await ReportNote.create(
      { report_id: reportId, admin_id: actor.id, body: body.slice(0, 2000), created_at: nowIso() },
      { transaction: tx },
    );
    return row.id;
  }

  /** The case history's record that deactivation closed a case. */
  private async recordSupersede(
    tx: Transaction,
    actor: AdminActor,
    caseId: string,
    targetType: "report" | "comment",
    targetId: string,
    reportId: string,
    flagsResolved: number,
  ): Promise<void> {
    await auditService.record(tx, {
      actorKind: "admin",
      actorId: actor.id,
      action: "moderation.supersede",
      targetType,
      targetId,
      reportId,
      caseId,
      metadata: { by: "incident.deactivate", flagsResolved },
      ip: actor.ip,
    });
  }

  private async stateView(report: Report, tx?: Transaction): Promise<IncidentStateView> {
    const refs = await loadAdminRefs([report.assigned_admin_id], tx);
    return {
      id: report.id,
      caseRef: report.case_ref,
      status: report.status,
      moderationState: report.moderation_state,
      displayStatus: displayStatusOf({
        moderationState: report.moderation_state,
        status: report.status,
        visibility: report.visibility,
      }),
      moderationReason: report.moderation_reason ?? null,
      moderationReasonLabel: ownerReasonLabel(report.moderation_state, report.moderation_reason),
      moderationNote: report.moderation_note ?? null,
      assignee: report.assigned_admin_id ? assigneeRef(refs.get(report.assigned_admin_id)) : null,
      assignedAt: report.assigned_at ?? null,
      verifiedAt: report.verified_at ?? null,
      runId: null,
      changed: true,
    };
  }

  /** The Incident Lifecycle: status events and the publication/assignment audit rows, oldest first. */
  private timeline(
    statusEvents: readonly ReportStatusEvent[],
    audits: readonly AuditEvent[],
    refs: ReadonlyMap<string, AdminRef>,
  ): IncidentTimelineItem[] {
    const items: IncidentTimelineItem[] = [];

    for (const event of statusEvents) {
      const kind: AuditActorKind =
        event.actor_kind === "moderator" ? "admin" : event.actor_kind === "owner" ? "member" : "system";
      const reasonLabel = event.status === "dismissed" ? dismissReasonLabel(event.reason_code) : null;
      items.push({
        id: event.id,
        at: event.at,
        kind: "status",
        action: `status.${event.status}`,
        label: timelineLabel(`status.${event.status}`, null),
        status: event.status,
        actor: this.actorRef(kind, event.actor_id ?? null, refs),
        reasonCode: event.reason_code ?? null,
        reasonLabel,
        note: event.note ?? null,
        noteVisibility: event.note ? "author" : null,
        moderationState: null,
        assignee: null,
      });
    }

    for (const row of audits) {
      const metadata = row.metadata ?? null;
      const isAssign = row.action === "incident.assign";
      const assigneeId = isAssign ? assigneeIdIn(metadata, "after") : null;
      const reasonCode = row.reason_code ?? null;
      let reasonLabel: string | null = null;
      if (row.action === "moderation.reject" || row.action === "evidence.reject") reasonLabel = rejectReasonLabel(reasonCode);
      if (row.action === "incident.deactivate") reasonLabel = deactivateReasonLabel(reasonCode);
      items.push({
        id: row.id,
        at: row.at,
        kind: isAssign ? "assignment" : row.actor_kind === "member" ? "author" : "moderation",
        action: row.action,
        label: isAssign
          ? assigneeId
            ? `Assigned to ${refs.get(assigneeId)?.name ?? "a team member"}`
            : "Unassigned"
          : timelineLabel(row.action, metadata),
        status: null,
        actor: this.actorRef(row.actor_kind, row.actor_id ?? null, refs),
        reasonCode,
        reasonLabel,
        note: row.note ?? null,
        noteVisibility: row.note ? "internal" : null,
        moderationState:
          moderationStateIn(metadata, "before") !== null || moderationStateIn(metadata, "after") !== null
            ? { before: moderationStateIn(metadata, "before"), after: moderationStateIn(metadata, "after") }
            : null,
        assignee: assigneeId ? { id: assigneeId, name: refs.get(assigneeId)?.name ?? null } : null,
      });
    }

    // Oldest first; a status event before an audit row at the same instant
    // (filing writes the `submitted` event before the pipeline decides).
    return items.sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? -1 : 1;
      if (a.kind === "status" && b.kind !== "status") return -1;
      if (b.kind === "status" && a.kind !== "status") return 1;
      return 0;
    });
  }

  /**
   * Who acted, for the lifecycle. Members are shown as "Author" by role, never
   * by name — the lifecycle is readable by tiers that may not know who filed an
   * anonymous report.
   */
  private actorRef(
    kind: AuditActorKind,
    id: string | null,
    refs: ReadonlyMap<string, AdminRef>,
  ): IncidentTimelineItem["actor"] {
    switch (kind) {
      case "admin":
        return { kind, id, name: id ? refs.get(id)?.name ?? null : null };
      case "member":
        return { kind, id: null, name: "Author" };
      case "ai":
        return { kind, id: null, name: "AI check" };
      case "system":
      default:
        return { kind: "system", id: null, name: "System" };
    }
  }
}

/** The assignee id an `incident.assign` row recorded under `before` / `after`. */
function assigneeIdIn(metadata: Record<string, unknown> | null, key: "before" | "after"): string | null {
  const value = metadata?.[key];
  if (value && typeof value === "object") {
    const id = (value as { assigneeId?: unknown }).assigneeId;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** The tier for the acting operator — the one definition lives in the guard. */
function incidentAccessForActor(actor: AdminActor): IncidentAccess {
  return incidentAccessFor(actor.role);
}

export const incidentAdminService = new IncidentAdminService();
export default incidentAdminService;
