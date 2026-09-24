/**
 * Content Moderation shapes and vocabulary.
 *
 * Mirrors `docs/ADMIN_MODERATION_API.md` (backend package 2A) field for field —
 * the wire types there are themselves copied from
 * `services/moderation_admin.service.ts`, so the three stay in step. Nothing
 * here is permissive on purpose: a union for every code the API can send means a
 * tab, a badge or a reason the server cannot produce is a compile error rather
 * than an empty cell at runtime.
 *
 * Two axes run through every screen and are never confused (plan D1):
 * **publication** (`moderationState` — decided here, in Content Moderation) and
 * the **case verdict** (`status` — decided in Incident Management). Approving
 * publishes; it never verifies. That is why no label below says "verified".
 *
 * The label catalogues are the plan's (§3.1 policy categories, §3.3 reasons,
 * hold reasons as staff wording). The API also returns labels on most detail
 * payloads (`LabelledCode`), and those are preferred where present; these maps
 * cover the list rows, the dialogs and the history, which carry codes only.
 */

import type { BadgeTone } from "@/components/ui/Badge";

// ── Shared vocabulary (§3.1, §3.2) ──────────────────────────────────────────

/** §3.1 — the order is part of the contract (tabs, AI category rows). */
export const POLICY_CATEGORIES = [
  "threat",
  "harassment",
  "hate",
  "private_info",
  "misleading",
  "spam",
  "graphic",
  "other",
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/** Admin tab / label for each code — the prototype's titles (`ADMIN_TAB_LABELS`). */
export const POLICY_CATEGORY_LABELS: Record<PolicyCategory, string> = {
  threat: "Direct Threat & Violence",
  harassment: "Harassment & Bullying",
  hate: "Hate Speech & Discrimination",
  private_info: "Private Details / Doxxing",
  misleading: "Misleading or Untrue Content",
  spam: "Spam or Advertising",
  graphic: "Graphic or Sexual Content",
  other: "Other",
};

export type ModerationQueueTab = "all" | "ai" | "keyword" | "user" | "media" | PolicyCategory;
export type ModerationTargetType = "report" | "comment";
export type CaseState = "open" | "resolved";
export type CaseResolution = "approved" | "rejected" | "auto_cleared" | "withdrawn" | "superseded";

export type ReportModerationState = "pending" | "approved" | "held" | "rejected" | "deactivated";
export type CommentModerationState = "pending" | "approved" | "held" | "rejected";
export type TargetModerationState = ReportModerationState | CommentModerationState;
export type CommentStatus = "visible" | "hidden" | "removed";
export type EvidenceModerationState = "pending" | "approved" | "rejected";
export type EvidenceApprovedScope = "full" | "thumbnail";

export type ReportStatus = "draft" | "submitted" | "under_review" | "verified" | "dismissed";
export type ReportCategory =
  | "policing"
  | "profiling"
  | "housing"
  | "workplace"
  | "education"
  | "medical"
  | "digital"
  | "harassment"
  | "other";
export type Visibility = "public" | "trusted" | "private";
export type LocationPrecision = "exact" | "approximate" | "hidden";
export type TimePrecision = "exact" | "day_part" | "unknown";
export type DayPart = "morning" | "afternoon" | "evening" | "night";
export type EvidenceKind = "photo" | "video" | "audio" | "document";
export type UploadState = "pending" | "uploaded" | "sealed" | "failed";
export type EvidenceStrength = "thin" | "fair" | "strong" | "very_strong";
export type UserStatus = "active" | "suspended" | "deleted" | "banned";
export type FlagStatus = "open" | "resolved" | "dismissed";

export type SafetyRisk = "none" | "self_harm" | "imminent_danger";
export type AiStatus = "assessed" | "unavailable" | "blocked" | "skipped" | "error";
export type AiRecommendation = "approve" | "review";
export type AiSeverity = "low" | "medium" | "high";
export type RunTrigger =
  | "filed"
  | "edited"
  | "resubmitted"
  | "comment"
  | "flagged"
  | "manual"
  | "evidence";
export type RunStatus = "queued" | "running" | "done" | "cancelled";
export type RunOutcome = "approve" | "hold" | "hide" | "keep" | "noop";

export type HoldReason =
  | "safety_risk"
  | "ai_violation"
  | "keyword_match"
  | "injection_suspected"
  | "ai_blocked"
  | "ai_low_confidence"
  | "ai_unavailable"
  | "content_unreadable"
  | "content_too_long"
  | "resubmission"
  | "author_banned"
  | "media_unassessed"
  | "user_flags"
  | "system_error";

export type KeywordAction = "hold" | "signal" | "monitor";
export type KeywordField = "title" | "body" | "locationLabel";

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

export type AuditActorKind = "admin" | "system" | "ai" | "member";
export type AuditTargetType =
  | "report"
  | "comment"
  | "evidence"
  | "flag"
  | "case"
  | "keyword_rule"
  | "member";

/** Every audit action the history can show. Typed as `string` on the wire row too, for forwards compatibility. */
export type AuditAction =
  | "moderation.auto_approve"
  | "moderation.hold"
  | "moderation.auto_hide"
  | "moderation.keep"
  | "moderation.cancel"
  | "moderation.approve"
  | "moderation.reject"
  | "moderation.rerun"
  | "moderation.withdraw"
  | "moderation.supersede"
  | "evidence.approve"
  | "evidence.reject"
  | "keyword_rule.create"
  | "keyword_rule.update"
  | "keyword_rule.delete"
  | "member.ban"
  | "member.unban"
  | "incident.verify"
  | "incident.dismiss"
  | "incident.reopen"
  | "incident.deactivate"
  | "incident.reactivate"
  | "incident.assign"
  | "incident.note"
  | "report.file"
  | "report.edit"
  | "report.resubmit"
  | "report.delete"
  | "comment.create"
  | "comment.remove"
  | "flag.create"
  | "flag.resolve"
  | "flag.dismiss"
  | "self_action.refused";

/** A code with the label the server rendered for it. */
export interface LabelledCode<C extends string = string> {
  code: C;
  label: string;
}

/** An operator, as decisions and resolutions name them. `role` is an AdminRole key. */
export interface AdminRef {
  id: string;
  name: string;
  role: string;
}

// ── Reason catalogues (§3.3) ────────────────────────────────────────────────

export type RejectReasonCode = PolicyCategory;
export type BanReasonCode = "threats" | "harassment" | "hate" | "spam" | "repeat" | "other";
export type DismissReasonCode =
  | "not_credible"
  | "duplicate"
  | "out_of_scope"
  | "insufficient_detail"
  | "withdrawn"
  | "other";
export type DeactivateReasonCode = "reporter_request" | "legal" | "filed_in_error" | "other";

/** Reject content — the author reads the label (and the note), so it is written to them. */
export const REJECT_REASON_LABELS: Record<RejectReasonCode, string> = {
  threat: "Threatening content",
  harassment: "Harassment",
  hate: "Hate speech",
  private_info: "Exposes private details",
  misleading: "Fabricated, joke or trolling (not a genuine account)",
  spam: "Spam or advertising",
  graphic: "Graphic or sexual content",
  other: "Other",
};

/** Ban a member — staff-only wording. */
export const BAN_REASON_LABELS: Record<BanReasonCode, string> = {
  threats: "Threats of violence",
  harassment: "Targeted harassment",
  hate: "Hate speech",
  spam: "Spam or automated abuse",
  repeat: "Repeated policy violations",
  other: "Other",
};

/** Dismiss and deactivate labels appear in a report's history, not in this screen's dialogs. */
export const DISMISS_REASON_LABELS: Record<DismissReasonCode, string> = {
  not_credible: "Not credible on the evidence provided",
  duplicate: "Duplicate of an existing incident",
  out_of_scope: "Outside BlackNexa scope",
  insufficient_detail: "Insufficient detail to proceed",
  withdrawn: "Withdrawn by the reporter",
  other: "Other",
};

export const DEACTIVATE_REASON_LABELS: Record<DeactivateReasonCode, string> = {
  reporter_request: "Reporter requested removal",
  legal: "Legal or safeguarding instruction",
  filed_in_error: "Filed in error by the reporter",
  other: "Other",
};

/** Dialog options, in catalogue order. */
export const REJECT_REASONS: readonly { value: RejectReasonCode; label: string }[] =
  POLICY_CATEGORIES.map((code) => ({ value: code, label: REJECT_REASON_LABELS[code] }));

export const BAN_REASONS: readonly { value: BanReasonCode; label: string }[] = (
  Object.keys(BAN_REASON_LABELS) as BanReasonCode[]
).map((code) => ({ value: code, label: BAN_REASON_LABELS[code] }));

/** §3.3: "`other` always requires a note." The API refuses it too; this keeps the button honest. */
export function reasonNeedsNote(code: string): boolean {
  return code === "other";
}

/** Hold reasons — staff wording (§3.3). The list rows carry codes only. */
export const HOLD_REASON_LABELS: Record<HoldReason, string> = {
  safety_risk: "Safety risk",
  ai_violation: "AI found a violation",
  keyword_match: "Keyword match",
  injection_suspected: "Possible instruction injection",
  ai_blocked: "AI declined to assess",
  ai_low_confidence: "AI not confident",
  ai_unavailable: "AI unavailable",
  content_unreadable: "Content unreadable",
  content_too_long: "Too long for the AI to read in full",
  resubmission: "Resubmitted after rejection",
  author_banned: "Author banned",
  media_unassessed: "Media needs review",
  user_flags: "User flags",
  system_error: "System error",
};

// ── Display labels ──────────────────────────────────────────────────────────

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
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

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Public",
  trusted: "Trusted",
  private: "Private",
};

/**
 * The target's publication state as a pill.
 *
 * Report and comment vocabularies share codes but not meaning: an approved
 * report is *published* to the feed, an approved comment is *visible* on a
 * thread, and a rejected comment was *removed*. The label follows the target
 * type so the pill says what actually happened.
 */
export function targetStateLabel(
  targetType: ModerationTargetType,
  state: TargetModerationState,
): string {
  switch (state) {
    case "pending":
      return "Checking";
    case "held":
      return "Held for review";
    case "approved":
      return targetType === "comment" ? "Visible" : "Published";
    case "rejected":
      return targetType === "comment" ? "Removed" : "Rejected";
    case "deactivated":
      return "Deactivated";
  }
}

export const TARGET_STATE_TONES: Record<TargetModerationState, BadgeTone> = {
  pending: "pending",
  held: "under_review",
  approved: "published",
  rejected: "rejected",
  deactivated: "deactivated",
};

export const CASE_RESOLUTION_LABELS: Record<CaseResolution, string> = {
  approved: "Approved",
  rejected: "Rejected",
  auto_cleared: "Cleared by the automated check",
  withdrawn: "Withdrawn by the author",
  superseded: "Closed by deactivation",
};

export const CASE_RESOLUTION_TONES: Record<CaseResolution, BadgeTone> = {
  approved: "approved",
  rejected: "rejected",
  auto_cleared: "published",
  withdrawn: "draft",
  superseded: "deactivated",
};

export const SAFETY_RISK_LABELS: Record<Exclude<SafetyRisk, "none">, string> = {
  self_harm: "Self-harm",
  imminent_danger: "Imminent danger",
};

/** Whether a safety signal is present — `null` and `"none"` both mean no. */
export function hasSafetyRisk(
  risk: SafetyRisk | null | undefined,
): risk is Exclude<SafetyRisk, "none"> {
  return risk === "self_harm" || risk === "imminent_danger";
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  deleted: "Deleted",
  banned: "Banned",
};

export const USER_STATUS_TONES: Record<UserStatus, BadgeTone> = {
  active: "active",
  suspended: "suspended",
  deleted: "deleted",
  banned: "rejected",
};

export const FLAG_STATUS_LABELS: Record<FlagStatus, string> = {
  open: "Open",
  resolved: "Action taken",
  dismissed: "Dismissed",
};

export const FLAG_STATUS_TONES: Record<FlagStatus, BadgeTone> = {
  open: "pending",
  resolved: "rejected",
  dismissed: "draft",
};

export const RUN_TRIGGER_LABELS: Record<RunTrigger, string> = {
  filed: "Filed",
  edited: "Edited",
  resubmitted: "Resubmitted",
  comment: "Comment",
  flagged: "Flag re-check",
  manual: "Manual re-run",
  evidence: "New evidence",
};

export const RUN_OUTCOME_LABELS: Record<RunOutcome, string> = {
  approve: "Approved",
  hold: "Held",
  hide: "Hidden",
  keep: "Kept",
  noop: "Cancelled",
};

export const AI_STATUS_LABELS: Record<AiStatus, string> = {
  assessed: "Assessed",
  unavailable: "AI unavailable",
  blocked: "AI declined",
  skipped: "AI skipped",
  error: "AI error",
};

export const AI_SEVERITY_LABELS: Record<AiSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const KEYWORD_FIELD_LABELS: Record<KeywordField, string> = {
  title: "Title",
  body: "Body",
  locationLabel: "Location",
};

export const KEYWORD_ACTION_LABELS: Record<KeywordAction, string> = {
  hold: "Hold",
  signal: "Signal",
  monitor: "Monitor",
};

/** One queue tab: its API value and the label the design shows. */
export interface QueueTabDefinition {
  value: ModerationQueueTab;
  label: string;
  /**
   * Shown only while it has open cases. Graphic and Other are the two
   * categories the prototype never had a tab for; an always-empty tab is noise
   * on a strip that is already thirteen wide.
   */
  hideWhenEmpty?: boolean;
}

/** §8.2 — the four sources, then the eight policy categories, in contract order. */
export const QUEUE_TABS: readonly QueueTabDefinition[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI Flags" },
  { value: "keyword", label: "Keyword Flags" },
  { value: "user", label: "User Flags" },
  { value: "media", label: "Media Review" },
  ...POLICY_CATEGORIES.map((code) => ({
    value: code,
    label: POLICY_CATEGORY_LABELS[code],
    ...(code === "graphic" || code === "other" ? { hideWhenEmpty: true } : {}),
  })),
];

export const QUEUE_TAB_VALUES: readonly ModerationQueueTab[] = QUEUE_TABS.map((t) => t.value);

// ── The queue (GET /cases, GET /cases/summary) ──────────────────────────────

export type CaseSort = "priority" | "newest" | "oldest";

/** Which signals raised a case — one "Flag By" badge each. */
export interface CaseSources {
  ai: boolean;
  keyword: boolean;
  user: boolean;
  media: boolean;
}

export interface CaseListItem {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  /** The report title; for a comment case, the first 100 characters of the comment. */
  title: string;
  report: { id: string; caseRef: string; title: string };
  author: { id: string; displayName: string } | null;
  category: ReportCategory;
  visibility: Visibility;
  location: string | null;
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
  submittedAt: string;
  openedAt: string;
  lastSignalAt: string;
  sources: CaseSources;
  userFlagCount: number;
  categories: PolicyCategory[];
  holdReasons: HoldReason[];
  priority: number;
  targetState: TargetModerationState;
  state: CaseState;
  resolution: CaseResolution | null;
  resolvedAt: string | null;
}

export interface CaseListParams {
  page: number;
  limit: number;
  tab: ModerationQueueTab;
  state: CaseState;
  sort: CaseSort;
  search: string;
}

export interface CaseSummary {
  open: number;
  tabs: Record<ModerationQueueTab, number>;
  urgent: number;
  safety: number;
  byTargetType: { report: number; comment: number };
}

// ── One case (GET /cases/:id) ───────────────────────────────────────────────

export interface CaseView {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  commentId: string | null;
  state: CaseState;
  resolution: CaseResolution | null;
  resolutionReason: string | null;
  resolutionReasonLabel: string | null;
  /** Author-visible note given with the decision. */
  resolutionNote: string | null;
  /** Staff-only. */
  internalNote: string | null;
  resolvedAt: string | null;
  resolvedBy: AdminRef | null;
  sources: CaseSources;
  userFlagCount: number;
  categories: LabelledCode<PolicyCategory>[];
  holdReasons: LabelledCode<HoldReason>[];
  priority: number;
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
  openedAt: string;
  lastSignalAt: string;
  latestRunId: string | null;
}

export interface AdminLocationView {
  label: string | null;
  precision: LocationPrecision;
  lat: number | null;
  lng: number | null;
  exactLat: number | null;
  exactLng: number | null;
}

/** One file. No URLs — "View" asks the evidence endpoint for a short-lived link. */
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

/** The staff projection of a report: full body, every file, exact location. */
export interface AdminReportView {
  id: string;
  caseRef: string;
  title: string;
  /** Null only when the sealed body cannot be opened. */
  body: string | null;
  bodyUnreadable: boolean;
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
  /** Sent back on approve/reject so an edit made in between answers 409. */
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

export interface AdminCommentView {
  id: string;
  reportId: string;
  parentId: string | null;
  body: string;
  anonymous: boolean;
  status: CommentStatus;
  moderationState: CommentModerationState;
  moderationReason: string | null;
  moderationReasonLabel: string | null;
  createdAt: string;
  moderatedAt: string | null;
  likeCount: number;
  author: { id: string; displayName: string } | null;
}

/** D15: moderators see who wrote it, even when it was posted anonymously. */
export interface CaseAuthorView {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  memberSince: string | null;
  anonymousOnThisItem: boolean;
  stats: {
    reports: number;
    rejected: number;
    commentsRemoved: number;
    flagsAgainst: number;
  };
}

export interface AiCategoryView {
  code: PolicyCategory;
  label: string;
  violation: boolean;
  confidence: number;
  severity: AiSeverity;
  evidence: string | null;
  evidenceEnglish: string | null;
}

export interface AiAssessmentView {
  runId: string;
  trigger: RunTrigger;
  aiStatus: "assessed" | "blocked";
  outcome: RunOutcome | null;
  recommendation: AiRecommendation | null;
  confidence: number | null;
  summary: string | null;
  language: string | null;
  safetyRisk: SafetyRisk | null;
  injectionSuspected: boolean;
  blockReason: string | null;
  model: string | null;
  policyVersion: string | null;
  durationMs: number | null;
  imagesAssessed: number;
  categories: AiCategoryView[];
  holdReasons: LabelledCode<HoldReason>[];
  finishedAt: string | null;
}

export interface KeywordHitView {
  /** Null for the built-in detectors (email, phone, SSN, card). */
  ruleId: string | null;
  ruleName: string;
  category: PolicyCategory;
  categoryLabel: string;
  /** The rule term that matched; detectors report their label, never the value. */
  term: string;
  field: KeywordField;
  action: KeywordAction;
}

export interface UserFlagView {
  id: string;
  flagRef: string;
  category: PolicyCategory;
  categoryLabel: string;
  /** As stored — may be a legacy code on old rows. */
  reason: string;
  note: string | null;
  status: FlagStatus;
  resolution: string | null;
  caseId: string | null;
  contentVersion: number | null;
  createdAt: string;
  resolvedAt: string | null;
  /** D15: visible to moderators, never to the author. Null once the reporter deleted their account. */
  reporter: {
    id: string;
    displayName: string;
    memberSince: string | null;
    flagsFiled: number;
  } | null;
}

export interface PreviousRejectionView {
  caseId: string;
  reasonCode: string | null;
  reasonLabel: string | null;
  publicNote: string | null;
  internalNote: string | null;
  resolvedAt: string | null;
  resolvedBy: AdminRef | null;
}

export interface HistoryItem {
  id: string;
  at: string;
  /** An `AuditAction`; typed wider so a new server action renders instead of breaking the page. */
  action: AuditAction | (string & {});
  actorKind: AuditActorKind;
  actor: { id: string; name: string } | null;
  targetType: AuditTargetType;
  targetId: string | null;
  caseId: string | null;
  reasonCode: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RunView {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  outcome: RunOutcome | null;
  reasons: HoldReason[];
  aiStatus: AiStatus | null;
  aiRecommendation: AiRecommendation | null;
  aiConfidence: number | null;
  safetyRisk: SafetyRisk | null;
  attempts: number;
  maxAttempts: number;
  contentVersion: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  imagesAssessed: number | null;
  keywordHitCount: number;
}

export interface CaseDetail {
  case: CaseView;
  /** `report` is the case's report — for a comment case, the comment's parent report. */
  target: { report: AdminReportView; comment: AdminCommentView | null };
  author: CaseAuthorView | null;
  ai: AiAssessmentView | null;
  keywordHits: KeywordHitView[];
  userFlags: UserFlagView[];
  previousRejection: PreviousRejectionView | null;
  history: HistoryItem[];
  runs: RunView[];
}

// ── Decisions ───────────────────────────────────────────────────────────────

export interface ApproveCaseInput {
  internalNote?: string;
  contentVersion?: number;
  /**
   * Report cases: the sealed files waiting for review (or approved at
   * thumbnail scope) that were rendered when the moderator opened the dialog
   * — ≤ 50 ids (contract §2.5, review Q6). Only these are released in full;
   * any other pending file stays pending and gets its own automated check.
   * Omitted or empty, no pending file is released.
   */
  evidenceIds?: string[];
}

export interface RejectCaseInput {
  reasonCode: RejectReasonCode;
  publicNote?: string;
  internalNote?: string;
  contentVersion?: number;
}

export interface RejectEvidenceInput {
  reasonCode?: RejectReasonCode;
  internalNote?: string;
}

export interface BanMemberInput {
  reasonCode: BanReasonCode;
  note?: string;
  caseId?: string;
}

export interface UnbanMemberInput {
  note?: string;
  caseId?: string;
}

export interface CaseDecisionResult {
  caseId: string;
  resolution: "approved" | "rejected";
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  targetState: TargetModerationState;
  evidenceApproved: number;
  flagsResolved: number;
  runsCancelled: number;
  firstPublish: boolean;
}

export interface EvidenceRejectResult {
  caseId: string;
  evidenceId: string;
  moderationState: "rejected";
  approvedScope: null;
}

export interface RerunResponse {
  caseId: string;
  runId: string;
}

export interface MemberStatusResult {
  memberId: string;
  status: UserStatus;
  sessionsRevoked: number;
}

export interface EvidenceLink {
  url: string;
  thumbUrl: string | null;
}

// ── Stats (GET /stats — the Phase 3 dashboard reads it too) ─────────────────

export interface ModerationStats {
  openCases: number;
  bySource: { ai: number; keyword: number; user: number; media: number };
  urgentOpen: number;
  safetyOpen: number;
  urgentUnassignedBreached: number;
  safetyFlagBreached: number;
  oldestOpenMinutes: number;
  runsQueued: number;
  runsFailedLastHour: number;
  autoApprovedLast24h: number;
  heldLast24h: number;
  heldRateByLanguage: { language: string; assessed: number; held: number; rate: number }[];
  slaMinutes: number;
  safetyFlagSlaMinutes: number;
  generatedAt: string;
}
