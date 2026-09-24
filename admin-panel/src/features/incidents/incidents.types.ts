/**
 * Incident Management shapes — the console side of `/api/v1/admin/incidents`.
 *
 * Mirrors the wire types in `blacknexa-backend/src/services/incident_admin.service.ts`
 * and the contract written out in `blacknexa-backend/docs/ADMIN_MODERATION_API.md`
 * §1 and §3. The console calls a filed report an *incident*; the backend calls
 * it a report (`reports`, `BNX-####`). The route param is the report's UUID.
 *
 * Two axes, never confused (plan D1). `status` is the *case verdict* —
 * submitted → under_review → verified / dismissed — and is what this screen
 * decides. `moderationState` is *publication* — pending · approved · held ·
 * rejected · deactivated — decided in Content Moderation, except that
 * Deactivate / Reactivate live here (D10). The status tabs follow that split:
 * "Deactivated" filters publication, and every other tab excludes deactivated
 * incidents, exactly as the server does.
 *
 * Every vocabulary is a union backed by an ordered array, as in the contact and
 * staff features: a filter, a badge or a reason for a value the API cannot send
 * is then a compile error rather than an empty table. The reason catalogues are
 * the §3.3 codes with the labels the author is shown — the console sends the
 * code, and the server writes the label on the author's notification, so the
 * two ends read the same words.
 */

import type { BadgeTone } from "@/components/ui/Badge";
import type {
  EvidenceKind,
  EvidenceModerationState,
} from "@/components/evidence/EvidenceGrid";
import type { RoleKey } from "@/types/rbac";

// ── Shared vocabulary (contract §1) ─────────────────────────────────────────

/** The nine report categories, in the mobile wizard's order. `other` included. */
export const REPORT_CATEGORIES = [
  "policing",
  "profiling",
  "housing",
  "workplace",
  "education",
  "medical",
  "digital",
  "harassment",
  "other",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  policing: "Policing",
  profiling: "Profiling",
  housing: "Housing",
  workplace: "Workplace",
  education: "Education",
  medical: "Medical",
  digital: "Digital",
  harassment: "Harassment",
  other: "Other",
};

/** Case verdict. `draft` never reaches this surface; it is listed so the union matches the server's. */
export type ReportStatus = "draft" | "submitted" | "under_review" | "verified" | "dismissed";

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  verified: "Verified",
  dismissed: "Dismissed",
};

/** Which pill each case status wears. `draft` borrows the neutral one. */
export const REPORT_STATUS_TONES: Record<ReportStatus, BadgeTone> = {
  draft: "draft",
  submitted: "submitted",
  under_review: "under_review",
  verified: "verified",
  dismissed: "dismissed",
};

/** Publication (§3.2). */
export type ReportModerationState = "pending" | "approved" | "held" | "rejected" | "deactivated";

/**
 * The moderation chip, staff wording.
 *
 * Not the owner's wording ("Checking", "With a moderator"): operators need to
 * know which queue the incident is waiting in, not how the author experiences
 * it. `approved` never renders as a chip — a published incident is the normal
 * case and a chip on every row would be noise.
 */
export const MODERATION_STATE_LABELS: Record<ReportModerationState, string> = {
  pending: "Checking",
  approved: "Published",
  held: "Held for review",
  rejected: "Rejected",
  deactivated: "Deactivated",
};

export const MODERATION_STATE_TONES: Record<ReportModerationState, BadgeTone> = {
  pending: "pending",
  approved: "published",
  held: "pending",
  rejected: "rejected",
  deactivated: "deactivated",
};

/** What the owner sees (§3.2). Shown to operators so they know what the author was told. */
export type DisplayStatus =
  | "checking"
  | "with_moderator"
  | "not_published"
  | "taken_down"
  | "published"
  | "private"
  | "under_review"
  | "verified"
  | "dismissed";

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  checking: "Checking",
  with_moderator: "With a moderator",
  not_published: "Not published",
  taken_down: "Taken down",
  published: "Published",
  private: "Private",
  under_review: "Under review",
  verified: "Verified",
  dismissed: "Dismissed",
};

export type Visibility = "public" | "trusted" | "private";

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Public",
  trusted: "Trusted",
  private: "Private",
};

export type LocationPrecision = "exact" | "approximate" | "hidden";

export const LOCATION_PRECISION_LABELS: Record<LocationPrecision, string> = {
  exact: "Exact location",
  approximate: "Approximate area",
  hidden: "Location hidden",
};

export type TimePrecision = "exact" | "day_part" | "unknown";
export type DayPart = "morning" | "afternoon" | "evening" | "night";

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export type UploadState = "pending" | "uploaded" | "sealed" | "failed";
export type EvidenceApprovedScope = "full" | "thumbnail";
export type EvidenceStrength = "thin" | "fair" | "strong" | "very_strong";

export const EVIDENCE_STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  thin: "Thin",
  fair: "Fair",
  strong: "Strong",
  very_strong: "Very strong",
};

export type UserStatus = "active" | "suspended" | "deleted" | "banned";
export type AuditActorKind = "admin" | "system" | "ai" | "member";

// ── Reason catalogues (§3.3) ────────────────────────────────────────────────

export const DISMISS_REASON_CODES = [
  "not_credible",
  "duplicate",
  "out_of_scope",
  "insufficient_detail",
  "withdrawn",
  "other",
] as const;

export type DismissReasonCode = (typeof DISMISS_REASON_CODES)[number];

export const DISMISS_REASON_LABELS: Record<DismissReasonCode, string> = {
  not_credible: "Not credible on the evidence provided",
  duplicate: "Duplicate of an existing incident",
  out_of_scope: "Outside BlackNexa scope",
  insufficient_detail: "Insufficient detail to proceed",
  withdrawn: "Withdrawn by the reporter",
  other: "Other",
};

export const DEACTIVATE_REASON_CODES = [
  "reporter_request",
  "legal",
  "filed_in_error",
  "other",
] as const;

export type DeactivateReasonCode = (typeof DEACTIVATE_REASON_CODES)[number];

export const DEACTIVATE_REASON_LABELS: Record<DeactivateReasonCode, string> = {
  reporter_request: "Reporter requested removal",
  legal: "Legal or safeguarding instruction",
  filed_in_error: "Filed in error by the reporter",
  other: "Other",
};

/** `other` always needs an author-facing note — Joi and the service both refuse it bare. */
export const REASON_NEEDING_NOTE = "other";

/** Author-visible note limit (`publicNote`, `reports.moderation_note`). */
export const PUBLIC_NOTE_MAX = 512;
/** Staff-only note limit (`internalNote`, `note`, and Internal Admin Notes). */
export const INTERNAL_NOTE_MAX = 2000;

// ── Access tiers (contract §3.0) ────────────────────────────────────────────

export type IncidentTier = "full" | "assigned" | "metadata";

/**
 * What the caller may see, as the server decided it. The detail page renders
 * from this rather than from the role, so the one definition — the guard in
 * `admin_guard.service.ts` — decides what each tier sees.
 */
export interface IncidentAccess {
  tier: IncidentTier;
  /** Only incidents assigned to this operator exist for them (advocates). */
  assignedOnly: boolean;
  /** Body, exact coordinates, evidence files. False for the metadata tier (staff). */
  seesContent: boolean;
  /** A named author's email. */
  seesAuthorEmail: boolean;
  /** Who filed an anonymous report (`moderation.view` or `incidents.verify`). */
  seesAnonymousIdentity: boolean;
}

// ── List (contract §3.1) ────────────────────────────────────────────────────

/** The six tabs. `deactivated` filters publication; every other tab excludes it. */
export const INCIDENT_STATUS_TABS = [
  "all",
  "submitted",
  "under_review",
  "verified",
  "dismissed",
  "deactivated",
] as const;

export type IncidentStatusTab = (typeof INCIDENT_STATUS_TABS)[number];

export const INCIDENT_STATUS_TAB_LABELS: Record<IncidentStatusTab, string> = {
  all: "All",
  submitted: "Submitted",
  under_review: "Under Review",
  verified: "Verified",
  dismissed: "Dismissed",
  deactivated: "Deactivated",
};

export type IncidentSort = "newest" | "oldest";

/** The prototype's date filter. Presets and the custom window are turned into bounds by the API module. */
export const INCIDENT_DATE_FILTERS = ["all", "today", "week", "month", "custom"] as const;

export type IncidentDateFilter = (typeof INCIDENT_DATE_FILTERS)[number];

export const INCIDENT_DATE_FILTER_LABELS: Record<IncidentDateFilter, string> = {
  all: "All Dates",
  today: "Today",
  week: "Past 7 Days",
  month: "This Month",
  custom: "Custom Date",
};

/**
 * Whose incidents a screen starts from.
 *
 * `assigned` is *My Assigned Cases* (`assignee=me`). Advocates are scoped to
 * their assignments by the server whatever the screen asks for.
 */
export type IncidentScope = "all" | "assigned";

export interface IncidentListParams {
  page: number;
  limit: number;
  scope: IncidentScope;
  status: IncidentStatusTab;
  search: string;
  category: ReportCategory | "all";
  date: IncidentDateFilter;
  /** Applied custom bounds, `YYYY-MM-DD` or "" — only read when `date` is "custom". */
  from: string;
  to: string;
  sort: IncidentSort;
}

export interface IncidentAssigneeRef {
  id: string;
  name: string;
  /** An admin role key; typed loosely because the server sends it as a string. */
  role: string;
  roleLabel: string;
}

export interface IncidentAuthorRef {
  /** Null when the identity is hidden from this caller. */
  id: string | null;
  /** "Anonymous" when hidden. */
  displayName: string;
  /** Filed anonymously. */
  anonymous: boolean;
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
  /** Urgent, still submitted, unassigned, older than the SLA. */
  slaBreached: boolean;
  visibility: Visibility;
  submittedAt: string;
  assignee: IncidentAssigneeRef | null;
  assignedAt: string | null;
  /** Null when the author's account is gone (an anonymous community record). */
  author: IncidentAuthorRef | null;
  /** Sealed files. */
  evidenceCount: number;
  openFlags: number;
  openCaseId: string | null;
}

/** Tab counts in the list's scope (contract §3.2). */
export interface IncidentSummary {
  /** Excludes deactivated. */
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

/** One person an incident can be assigned to (contract §3.3; D17). */
export interface AssigneeOption {
  id: string;
  name: string;
  email: string;
  role: Extract<RoleKey, "moderator" | "advocate">;
  roleLabel: string;
  /** Submitted / under-review, not deactivated, currently assigned to them. */
  openAssigned: number;
}

// ── Detail (contract §3.4) ──────────────────────────────────────────────────

export interface AdminRef {
  id: string;
  name: string;
  role: string;
}

export interface AdminLocationView {
  label: string | null;
  precision: LocationPrecision;
  lat: number | null;
  lng: number | null;
  /** True coordinates — null for the metadata tier and when none were recorded. */
  exactLat: number | null;
  exactLng: number | null;
}

/** One file. No URLs — "View" asks `GET /:id/evidence/:evidenceId`. */
export interface AdminEvidenceView {
  id: string;
  kind: EvidenceKind;
  mime: string;
  bytes: number;
  durationMs: number | null;
  capturedAt: string | null;
  sealedAt: string | null;
  sha256: string | null;
  uploadState: UploadState;
  moderationState: EvidenceModerationState;
  approvedScope: EvidenceApprovedScope | null;
  hasThumbnail: boolean;
  sortOrder: number;
}

/** `AdminReportView` cut to the caller's tier. */
export interface IncidentReportView {
  id: string;
  caseRef: string;
  title: string;
  /** Null for the metadata tier, and when the sealed body cannot be opened. */
  body: string | null;
  bodyUnreadable: boolean;
  /** True for the metadata tier: body and exact coordinates withheld. */
  contentRedacted: boolean;
  category: ReportCategory;
  status: ReportStatus;
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
  visibility: Visibility;
  anonymous: boolean;
  urgent: boolean;
  occurredAt: string;
  occurredPrecision: TimePrecision;
  occurredDayPart: DayPart | null;
  filedAt: string;
  publishedAt: string | null;
  moderatedAt: string | null;
  lastEditedAt: string | null;
  contentVersion: number;
  approvedContentVersion: number | null;
  humanReviewedVersion: number | null;
  resubmissionCount: number;
  moderationReason: string | null;
  moderationReasonLabel: string | null;
  moderationNote: string | null;
  location: AdminLocationView;
  evidence: AdminEvidenceView[];
  supportCount: number;
  commentCount: number;
  corroborationCount: number;
  evidenceStrength: EvidenceStrength;
}

export interface IncidentAuthorView extends IncidentAuthorRef {
  /** Only for tiers that see it, and only when the identity is visible. */
  email: string | null;
  status: UserStatus | null;
  memberSince: string | null;
}

export type IncidentTimelineKind = "status" | "moderation" | "assignment" | "author";

export interface IncidentTimelineItem {
  id: string;
  at: string;
  kind: IncidentTimelineKind;
  /** `status.<ReportStatus>` for case-status events, else the audit action. */
  action: string;
  /** Ready to print, e.g. "Approved and published by a moderator". */
  label: string;
  status: ReportStatus | null;
  /** Admins by name; members as "Author"; the AI as "AI check"; the system as "System". */
  actor: { kind: AuditActorKind; id: string | null; name: string | null };
  reasonCode: string | null;
  reasonLabel: string | null;
  note: string | null;
  /** "author": the author sees it on their timeline. */
  noteVisibility: "author" | "internal" | null;
  moderationState: { before: string | null; after: string | null } | null;
  assignee: { id: string; name: string | null } | null;
}

export interface IncidentNoteView {
  id: string;
  body: string;
  createdAt: string;
  /** Null once the operator's account is gone. */
  author: AdminRef | null;
}

/** Which workflow buttons the state allows. The console combines each with its permission. */
export interface IncidentActions {
  /** approved && (submitted | under_review) */
  verify: boolean;
  /** approved && (submitted | under_review) */
  dismiss: boolean;
  /** approved && dismissed */
  reopen: boolean;
  /** not deactivated */
  deactivate: boolean;
  /** deactivated */
  reactivate: boolean;
  /** always true */
  assign: boolean;
  /** not approved and not deactivated → "Resolve the moderation case first" */
  resolveModerationFirst: boolean;
}

export interface IncidentModerationView {
  state: ReportModerationState;
  displayStatus: DisplayStatus;
  /** Reject / deactivate code. */
  reasonCode: string | null;
  /** Only when rejected or deactivated. */
  reasonLabel: string | null;
  /** Author-visible note. */
  note: string | null;
  moderatedAt: string | null;
  /** The report's open moderation case — the "Resolve the moderation case first" link. */
  openCaseId: string | null;
  preDeactivationState: ReportModerationState | null;
  /** What Reactivate would do now; null unless deactivated. */
  reactivateRestores: "approved" | "pending" | null;
}

export interface IncidentDetail {
  access: IncidentAccess;
  report: IncidentReportView;
  author: IncidentAuthorView | null;
  assignee:
    | (IncidentAssigneeRef & { assignedAt: string | null; assignedBy: AdminRef | null })
    | null;
  moderation: IncidentModerationView;
  /** Who moved it to verified most recently (Case Record). */
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

/** A presigned, short-lived link (contract §2.4). */
export interface EvidenceLink {
  url: string;
  thumbUrl: string | null;
}

// ── Decisions (contract §3.6) ───────────────────────────────────────────────

/** What every decision answers with. Refetch the detail for the timeline and notes. */
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
  /** Reactivate only: the run queued when it went back to a check. */
  runId: string | null;
  /** False only when assign re-assigned the same person (nothing written). */
  changed: boolean;
}

/** `note` is internal — stored as an Internal Admin Note, never on the author's timeline. */
export interface VerifyIncidentInput {
  note?: string;
}

export interface DismissIncidentInput {
  reasonCode: DismissReasonCode;
  /** Shown to the author; required for `other`. */
  publicNote?: string;
  internalNote?: string;
}

/** A reason is required: undoing a dismissal needs one on the record. */
export interface ReopenIncidentInput {
  note: string;
}

export interface DeactivateIncidentInput {
  reasonCode: DeactivateReasonCode;
  /** Shown to the author; required for `other`. */
  publicNote?: string;
  internalNote?: string;
}

export interface ReactivateIncidentInput {
  note?: string;
}

/** `null` unassigns. */
export interface AssignIncidentInput {
  adminId: string | null;
}

export interface AddIncidentNoteInput {
  body: string;
}
