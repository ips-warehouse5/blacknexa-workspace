/**
 * Content Moderation for the console — the case queue, its detail, and every
 * human decision on it.
 *
 * docs/INCIDENT_MODULE_PLAN.md §8.1 (the API), §3.3 (reasons), §5.3 step 6 and
 * §5.4 (what a decision writes, and the lock order), D8, D15, D16, D18, D22.
 * Replaces `moderation_queue.service.ts`, which listed reports by case status,
 * could not see comments, AI verdicts, keyword hits or who flagged what, and
 * decided by moving the *verification* axis — the thing D1 separated from
 * publication. Here a moderator works `moderation_cases` (one per target,
 * opened by the pipeline and the flag service) and decides on *publication*.
 *
 * ── What a decision writes (one transaction, lock → re-check → write → audit)
 *   Approve & Publish / Keep Published / Keep Comment
 *     • report: `approved`, `moderated_at`, `approved_content_version`, and
 *       `human_reviewed_version = content_version` — D8: content a human cleared
 *       is never auto-hidden again at that version; `published_at` on the first
 *       publish (D11); the sealed evidence the moderator was *shown*
 *       (`evidenceIds`) approved at scope `full` (a human looked at those
 *       files — §11a, review R5, review Q6); any sealed file still pending
 *       after that — sealed after the render, or not on the list — gets its
 *       own `evidence` run, as does a file still uploading once it seals; the
 *       owner told "Your report is live" on the first publish, "…live again"
 *       when it had been published before and was held;
 *     • comment: `approveComment` from the pipeline — the counter moves through
 *       `setCommentState`, and the report owner hears "Someone replied" now, at
 *       approval, once (D18);
 *     • open flags → `dismissed`, reporters emailed "No action needed" after
 *       the commit; queued runs for the target cancelled; the case resolved
 *       `approved`.
 *   Reject / Reject & Take Down / Remove Comment
 *     • report: `rejected` with the reject code and the author-visible note,
 *       and `approved_content_version` cleared — the durable record that a
 *       human check is owed before any automated path may publish it again
 *       (D19, review Q7); the owner told "Your report wasn't published" with
 *       the reason label;
 *     • comment: `setCommentState(…, rejected)` and a `moderation_notice`
 *       "Your comment was removed" to its author, with the label and note;
 *     • open flags → `resolved` ("Action taken"); queued runs cancelled; the
 *       case resolved `rejected` with the code, the public and internal notes.
 *   Every human decision writes one `audit_events` row whose metadata carries
 *   `before` and `after` `{moderationState, status}` — the owner timeline
 *   (`report_timeline.ts`) derives "published / not published / live again"
 *   from exactly that.
 *
 * ── Concurrency (§5.4) ────────────────────────────────────────────────────
 * Lock order is the module's: target row → case → flags → counters. A report
 * case locks the report `FOR UPDATE`; a comment case locks the comment, then
 * its report `FOR NO KEY UPDATE` (the pipeline's order, review R4 — two comment
 * decisions on one report must not deadlock on `comment_count`), then the case.
 * The case is resolved with `resolveCase` — `UPDATE … WHERE state = 'open'
 * RETURNING` — so of two moderators deciding at once exactly one wins and the
 * other gets 409 before anything else is written. Every decision runs in
 * `adminTransaction` (5 s lock timeout → 409, D16 refusals audited). Pushes and
 * flag emails leave only after the commit (D18).
 *
 * ── Refusals ──────────────────────────────────────────────────────────────
 *   404  no such case / file
 *   403  D16 — the operator wrote the content or flagged it (audited)
 *   409  case already resolved · target deleted, removed or deactivated ·
 *        the content changed since the moderator opened it (optional
 *        `contentVersion` guard) · re-run of something that is not held
 */

import { Op, QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report, ReportEvidence } from "@/models/report.model";
import { ReportComment, ReportFlag } from "@/models/report_social.model";
import { AppUser, UserSession } from "@/models/app_user.model";
import { AuditEvent, ModerationCase, ModerationRun, type ModerationCaseRow } from "@/models/moderation.model";
import encryptionService from "@/services/encryption.service";
import evidenceService, { approveEvidence } from "@/services/evidence.service";
import notificationService, { type PendingPush } from "@/services/notification.service";
import moderationCaseService, { type ResolvedFlagRow } from "@/services/moderation_case.service";
import { cancelQueuedRunsForTarget, enqueueRun, maxAttemptsFor } from "@/services/moderation_enqueue";
import { pokeModeration } from "@/services/moderation_signal";
import { approveComment, dispatchAfterCommit, requestRerun, type RerunResult } from "@/services/moderation_pipeline.service";
import { setCommentState } from "@/services/comment_state";
import auditService from "@/services/audit.service";
import flagService, { type FlagClosure } from "@/services/flag.service";
import {
  adminTransaction,
  assertNotSelf,
  assertReason,
  conflict,
  isoOf,
  likePattern,
  loadAdminRefs,
  type AdminActor,
  type AdminRef,
  type SelfCheckSubject,
} from "@/services/admin_guard.service";
import { HttpError, badRequest, notFound } from "@/middlewares/error.middleware";
import {
  ADMIN_TAB_LABELS,
  HOLD_REASON_LABELS,
  HOLD_REASONS,
  LEGACY_FLAG_CODES,
  MODERATION_QUEUE_TABS,
  OWNER_NOTIFICATIONS,
  RUN_PRIORITY,
  SAFETY_CATEGORIES,
  SAFETY_FLAG_SLA_MINUTES,
  banReasonLabel,
  displayStatusOf,
  isPolicyCategory,
  needsModeration,
  normaliseFlagCategory,
  ownerReasonLabel,
  rejectReasonLabel,
  type AiRecommendation,
  type AiSeverity,
  type AiStatus,
  type AuditAction,
  type AuditActorKind,
  type AuditTargetType,
  type CaseResolution,
  type CaseState,
  type CommentModerationState,
  type CommentStatus,
  type DisplayStatus,
  type EvidenceApprovedScope,
  type EvidenceModerationState,
  type FlagStatus,
  type HoldReason,
  type KeywordHit,
  type LegacyFlagCode,
  type ModerationQueueTab,
  type ModerationTargetType,
  type OwnerNotificationCopy,
  type PolicyCategory,
  type RejectReasonCode,
  type ReportModerationState,
  type RunOutcome,
  type RunStatus,
  type RunTrigger,
  type SafetyRisk,
} from "@/types/moderation.interface";
import type {
  DayPart,
  EvidenceKind,
  EvidenceStrength,
  ReportCategory,
  ReportStatus,
  TimePrecision,
  UploadState,
} from "@/types/report.interface";
import type { LocationPrecision, UserStatus, Visibility } from "@/types/user.interface";

// ─────────────────────────────────────────────────────────────────────────────
// Wire types — mirrored exactly in docs/ADMIN_MODERATION_API.md
// ─────────────────────────────────────────────────────────────────────────────

export type CaseSort = "priority" | "newest" | "oldest";

export interface CaseListQuery {
  page: number;
  limit: number;
  tab: ModerationQueueTab;
  state: CaseState;
  targetType?: ModerationTargetType;
  urgent?: boolean;
  search?: string;
  sort: CaseSort;
}

/** Which signals raised a case — one "Flag By" badge each in the queue. */
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
  /** The report's title; for a comment case, the first 100 characters of the comment. */
  title: string;
  report: { id: string; caseRef: string; title: string };
  /** The target's author. Null when the account was deleted or severed. */
  author: { id: string; displayName: string } | null;
  category: ReportCategory;
  visibility: Visibility;
  /** The report's area label. */
  location: string | null;
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
  /** When the target was written: the report's `filedAt`, or the comment's `createdAt`. */
  submittedAt: string;
  openedAt: string;
  lastSignalAt: string;
  sources: CaseSources;
  userFlagCount: number;
  categories: PolicyCategory[];
  holdReasons: HoldReason[];
  priority: number;
  /** The target's `moderation_state` (report or comment vocabulary). */
  targetState: ReportModerationState | CommentModerationState;
  state: CaseState;
  resolution: CaseResolution | null;
  resolvedAt: string | null;
}

export interface CaseSummary {
  /** Open cases, all tabs — equal to `tabs.all`. */
  open: number;
  tabs: Record<ModerationQueueTab, number>;
  urgent: number;
  safety: number;
  byTargetType: Record<ModerationTargetType, number>;
}

export interface LabelledCode<C extends string = string> {
  code: C;
  label: string;
}

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
  /** Author-visible note recorded with the decision. */
  resolutionNote: string | null;
  /** Staff-only note. */
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

/** One file, as staff see it. No URLs — the console asks the evidence endpoint on *View*. */
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

export interface AdminLocationView {
  label: string | null;
  precision: LocationPrecision;
  /** The rounded, servable coordinates. */
  lat: number | null;
  lng: number | null;
  /** The true coordinates, unsealed. Null when none were recorded or they cannot be opened. */
  exactLat: number | null;
  exactLng: number | null;
}

/** The staff projection of a report — the full body, every file, the exact location. */
export interface AdminReportView {
  id: string;
  caseRef: string;
  title: string;
  /** Null only when the sealed body cannot be opened (`bodyUnreadable`). */
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
  contentVersion: number;
  approvedContentVersion: number | null;
  humanReviewedVersion: number | null;
  resubmissionCount: number;
  /** A reject or deactivate code (author-visible), per `moderationState`. */
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

export interface CaseAuthorView {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  memberSince: string | null;
  /** The target was posted anonymously — shown to moderators all the same (C9, D15). */
  anonymousOnThisItem: boolean;
  stats: {
    /** Reports filed and not deleted. */
    reports: number;
    /** Times one of their reports was rejected by a moderator (resolved cases). */
    rejected: number;
    /** Their comments a moderator removed. */
    commentsRemoved: number;
    /** Flags ever raised against their reports and comments. */
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

/** The latest run on the target whose AI stage answered (`assessed` or `blocked`). */
export interface AiAssessmentView {
  runId: string;
  trigger: RunTrigger;
  aiStatus: Extract<AiStatus, "assessed" | "blocked">;
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
  /** All eight codes, in the fixed order, when the engine assessed; empty when blocked. */
  categories: AiCategoryView[];
  holdReasons: LabelledCode<HoldReason>[];
  finishedAt: string | null;
}

export interface KeywordHitView extends KeywordHit {
  categoryLabel: string;
}

export interface UserFlagView {
  id: string;
  flagRef: string;
  /** Canonical code (legacy codes normalised on read). */
  category: PolicyCategory;
  categoryLabel: string;
  /** The code as stored — may be a legacy code on rows from before revision 2. */
  reason: PolicyCategory | LegacyFlagCode | string;
  note: string | null;
  status: FlagStatus;
  resolution: string | null;
  caseId: string | null;
  contentVersion: number | null;
  createdAt: string;
  resolvedAt: string | null;
  /** D15: visible to moderators, never to the author. Null once the reporter deleted their account. */
  reporter: { id: string; displayName: string; memberSince: string | null; flagsFiled: number } | null;
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
  action: AuditAction;
  actorKind: AuditActorKind;
  /** Admins and members by name; null for `system` and `ai`, and for erased members. */
  actor: { id: string; name: string } | null;
  targetType: AuditTargetType;
  targetId: string | null;
  caseId: string | null;
  reasonCode: string | null;
  /** Staff-only note. */
  note: string | null;
  /** Before/after states, run ids, counts — never content. */
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
  /** From the target's most recent finished run. */
  keywordHits: KeywordHitView[];
  /** Every flag ever raised on the target, across cases, newest first (≤ 200). */
  userFlags: UserFlagView[];
  previousRejection: PreviousRejectionView | null;
  /** Audit rows about the target and its cases, newest first (≤ 100). */
  history: HistoryItem[];
  /** The target's five most recent runs, newest first. */
  runs: RunView[];
}

export interface CaseDecisionResult {
  caseId: string;
  resolution: Extract<CaseResolution, "approved" | "rejected">;
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  /** The target's `moderation_state` after the decision. */
  targetState: ReportModerationState | CommentModerationState;
  evidenceApproved: number;
  flagsResolved: number;
  runsCancelled: number;
  /** True when this approval published the report for the first time. */
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

export interface ModerationStats {
  openCases: number;
  bySource: { ai: number; keyword: number; user: number; media: number };
  urgentOpen: number;
  safetyOpen: number;
  /** Urgent reports still `submitted` and unassigned past the SLA — any moderation state. */
  urgentUnassignedBreached: number;
  /** Open cases carrying an open threat / private_info / graphic flag older than 60 minutes. */
  safetyFlagBreached: number;
  oldestOpenMinutes: number;
  runsQueued: number;
  /** Runs finished in the last hour whose AI stage was unavailable/errored, or that ended in `system_error`. */
  runsFailedLastHour: number;
  autoApprovedLast24h: number;
  heldLast24h: number;
  /** Assessed content decisions over the last 7 days, per AI-detected language (top 20). */
  heldRateByLanguage: { language: string; assessed: number; held: number; rate: number }[];
  slaMinutes: number;
  safetyFlagSlaMinutes: number;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — unit-tested in moderation_admin.service.test.ts
// ─────────────────────────────────────────────────────────────────────────────

/** A WHERE fragment and the replacements it names. */
export interface SqlFragment {
  sql: string;
  replacements: Record<string, unknown>;
}

/**
 * §8.1's tab → filter mapping, against the case table aliased `alias`:
 *   ai → ai_flagged · keyword → keyword_flagged · user → user_flag_count > 0 ·
 *   media → media_review · a policy code → `categories @> '["code"]'`.
 * `all` is no filter (null). `param` names the category replacement so several
 * fragments can share one statement (the summary counts every tab at once).
 */
export function caseTabFilter(tab: ModerationQueueTab, alias = "c", param = "tabCategory"): SqlFragment | null {
  switch (tab) {
    case "all":
      return null;
    case "ai":
      return { sql: `${alias}.ai_flagged = true`, replacements: {} };
    case "keyword":
      return { sql: `${alias}.keyword_flagged = true`, replacements: {} };
    case "user":
      return { sql: `${alias}.user_flag_count > 0`, replacements: {} };
    case "media":
      return { sql: `${alias}.media_review = true`, replacements: {} };
    default:
      if (isPolicyCategory(tab)) {
        return {
          sql: `${alias}.categories @> CAST(:${param} AS jsonb)`,
          replacements: { [param]: JSON.stringify([tab]) },
        };
      }
      throw badRequest("Unknown moderation tab.");
  }
}

/**
 * The queue's ORDER BY. `priority` (default): highest first, oldest first
 * within a priority. `newest` / `oldest` order by when the case opened — or,
 * on the Resolved view, when it was resolved, which is what a moderator
 * looking back through decisions means by "newest".
 */
export function caseOrderSql(sort: CaseSort, state: CaseState, alias = "c"): string {
  const time = state === "resolved" ? `COALESCE(${alias}.resolved_at, ${alias}.opened_at)` : `${alias}.opened_at`;
  switch (sort) {
    case "newest":
      return `${time} DESC, ${alias}.id DESC`;
    case "oldest":
      return `${time} ASC, ${alias}.id ASC`;
    case "priority":
    default:
      return `${alias}.priority DESC, ${alias}.opened_at ASC, ${alias}.id ASC`;
  }
}

/**
 * Every filter of `GET /cases` as WHERE clauses over `moderation_cases c`,
 * `reports r` and the author `app_users u`.
 */
export function caseListWhere(query: Pick<CaseListQuery, "tab" | "state" | "targetType" | "urgent" | "search">): {
  clauses: string[];
  replacements: Record<string, unknown>;
} {
  const clauses = ["c.state = :state"];
  const replacements: Record<string, unknown> = { state: query.state };
  const tab = caseTabFilter(query.tab);
  if (tab) {
    clauses.push(tab.sql);
    Object.assign(replacements, tab.replacements);
  }
  if (query.targetType) {
    clauses.push("c.target_type = :targetType");
    replacements.targetType = query.targetType;
  }
  if (typeof query.urgent === "boolean") {
    clauses.push("c.urgent = :urgent");
    replacements.urgent = query.urgent;
  }
  const search = query.search?.trim();
  if (search) {
    clauses.push(
      "(r.case_ref ILIKE :search OR r.title ILIKE :search OR u.display_name ILIKE :search OR u.email ILIKE :search)",
    );
    replacements.search = likePattern(search);
  }
  return { clauses, replacements };
}

/** The four "Flag By" sources of a case row. */
export function caseSources(row: {
  ai_flagged: boolean;
  keyword_flagged: boolean;
  user_flag_count: number;
  media_review: boolean;
}): CaseSources {
  return {
    ai: Boolean(row.ai_flagged),
    keyword: Boolean(row.keyword_flagged),
    user: Number(row.user_flag_count) > 0,
    media: Boolean(row.media_review),
  };
}

/**
 * The targets a banned member's open flags sit on (review Q2), one entry per
 * target, in a fixed order so two bans lock them in the same sequence. A
 * comment flag belongs to its comment whatever `report_id` it stored (legacy
 * comment flags stored none); a report flag has no `comment_id`.
 */
export function bannedFlagTargets(
  rows: readonly { report_id: string | null; comment_id: string | null }[],
): { targetType: ModerationTargetType; targetId: string }[] {
  const seen = new Map<string, { targetType: ModerationTargetType; targetId: string }>();
  for (const row of rows) {
    const target: { targetType: ModerationTargetType; targetId: string } | null = row.comment_id
      ? { targetType: "comment", targetId: row.comment_id }
      : row.report_id
        ? { targetType: "report", targetId: row.report_id }
        : null;
    if (target) seen.set(`${target.targetType}:${target.targetId}`, target);
  }
  return [...seen.values()].sort((a, b) =>
    a.targetType === b.targetType ? (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0) : a.targetType === "report" ? -1 : 1,
  );
}

/**
 * The body of an owner notification that carries a decision's reason: the
 * label, the moderator's author-facing note when there is one, then the fixed
 * copy. Never member text — only catalogue labels and staff-written notes.
 */
export function decisionNoticeBody(label: string | null, note: string | null | undefined, fixed: string | null): string {
  const parts: string[] = [];
  if (label) parts.push(`Reason: ${label}.`);
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (trimmed) parts.push(trimmed);
  if (fixed) parts.push(fixed);
  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CASE_GONE = "That moderation case does not exist.";
const CASE_NOT_ABOUT_MEMBER = "That case is not about this member.";
/** What a flag the ban dismissed says (staff-facing; the member is not emailed). */
const BANNED_REPORTER_RESOLUTION = "Closed: the member who raised it was banned.";
const ALREADY_DECIDED = "This case has already been decided. Reload it to see the outcome.";
const CONTENT_CHANGED =
  "The report was edited after you opened it. Reload it and review the new version before deciding.";
const HISTORY_LIMIT = 100;
const FLAG_LIMIT = 200;
const RUN_LIMIT = 5;
const COMMENT_TITLE_CHARS = 100;

/** Flags on content a moderator kept: the reporter hears nothing was wrong with it. */
const NO_ACTION: FlagClosure = {
  outcome: { status: "dismissed", resolution: "No action needed." },
  mail: {
    outcome: "No action needed",
    detail: "A moderator reviewed it and found it within the community rules. Thank you for flagging it.",
  },
};

/** Flags on content a moderator removed. */
const ACTION_TAKEN: FlagClosure = {
  outcome: { status: "resolved", resolution: "Action taken." },
  mail: {
    outcome: "Action taken",
    detail: "A moderator reviewed it and removed it under the community rules. Thank you for flagging it.",
  },
};

/** Raw `app_users` fields the detail reads. */
interface MemberRow {
  id: string;
  display_name: string | null;
  email: string;
  status: UserStatus;
  created_on: unknown;
}

interface CaseListRow {
  id: string;
  target_type: ModerationTargetType;
  target_id: string;
  report_id: string;
  state: CaseState;
  resolution: CaseResolution | null;
  resolved_at: string | null;
  ai_flagged: boolean;
  keyword_flagged: boolean;
  media_review: boolean;
  user_flag_count: number;
  categories: unknown;
  hold_reasons: unknown;
  priority: number;
  urgent: boolean;
  safety_risk: SafetyRisk | null;
  opened_at: string;
  last_signal_at: string;
  case_ref: string;
  report_title: string;
  category: ReportCategory;
  visibility: Visibility;
  location_label: string | null;
  filed_at: string;
  report_state: ReportModerationState;
  comment_body: string | null;
  comment_created_at: string | null;
  comment_state: CommentModerationState | null;
  author_id: string | null;
  author_name: string | null;
}

/** A locked decision target: the case and the row(s) it is about. */
interface CaseTargetContext {
  kase: ModerationCaseRow;
  report: Report | null;
  comment: ReportComment | null;
}

function categoryList(value: unknown): PolicyCategory[] {
  return Array.isArray(value) ? value.filter(isPolicyCategory) : [];
}

function holdReasonList(value: unknown): HoldReason[] {
  const allowed = HOLD_REASONS as readonly string[];
  return Array.isArray(value)
    ? value.filter((reason): reason is HoldReason => typeof reason === "string" && allowed.includes(reason))
    : [];
}

function labelledHoldReasons(value: unknown): LabelledCode<HoldReason>[] {
  return holdReasonList(value).map((code) => ({ code, label: HOLD_REASON_LABELS[code] }));
}

function clipText(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/** The staff view of one file. */
export function adminEvidenceView(row: ReportEvidence): AdminEvidenceView {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    bytes: row.bytes,
    durationMs: row.duration_ms ?? null,
    capturedAt: row.captured_at ?? null,
    sealedAt: row.sealed_at ?? null,
    sha256: row.sha256 ?? null,
    uploadState: row.upload_state,
    moderationState: row.moderation_state,
    approvedScope: row.approved_scope ?? null,
    hasThumbnail: Boolean(row.thumb_key),
    sortOrder: row.sort_order,
  };
}

/** Open a report's sealed body with the key chain; null when it cannot be opened. */
export async function openReportBody(report: Report): Promise<string | null> {
  if (!report.body_encrypted) return report.body;
  return encryptionService.openSealedStrict(report.body);
}

/** The true coordinates, unsealed, or nulls. */
export async function openExactLocation(report: Report): Promise<{ lat: number | null; lng: number | null }> {
  if (!report.location_exact_sealed) return { lat: null, lng: null };
  const opened = await encryptionService.openSealedStrict(report.location_exact_sealed);
  if (!opened) return { lat: null, lng: null };
  try {
    const parsed = JSON.parse(opened) as { lat?: unknown; lng?: unknown };
    return {
      lat: typeof parsed.lat === "number" ? parsed.lat : null,
      lng: typeof parsed.lng === "number" ? parsed.lng : null,
    };
  } catch {
    return { lat: null, lng: null };
  }
}

/**
 * The staff projection of a report — shared with Incident Management, which
 * redacts it per access tier (`incident_admin.service.ts`).
 */
export async function buildAdminReportView(report: Report): Promise<AdminReportView> {
  const [body, exact, evidence] = await Promise.all([
    openReportBody(report),
    openExactLocation(report),
    ReportEvidence.findAll({ where: { report_id: report.id }, order: [["sort_order", "ASC"]] }),
  ]);
  const state = report.moderation_state;
  return {
    id: report.id,
    caseRef: report.case_ref,
    title: report.title,
    body,
    bodyUnreadable: body === null,
    category: report.category,
    status: report.status,
    moderationState: state,
    displayStatus: displayStatusOf({ moderationState: state, status: report.status, visibility: report.visibility }),
    visibility: report.visibility,
    anonymous: report.anonymous,
    urgent: report.urgent,
    occurredAt: report.occurred_at,
    occurredPrecision: report.occurred_precision,
    occurredDayPart: report.occurred_day_part ?? null,
    filedAt: report.filed_at,
    publishedAt: report.published_at ?? null,
    moderatedAt: report.moderated_at ?? null,
    lastEditedAt: report.last_edited_at ?? null,
    contentVersion: report.content_version,
    approvedContentVersion: report.approved_content_version ?? null,
    humanReviewedVersion: report.human_reviewed_version ?? null,
    resubmissionCount: report.resubmission_count,
    moderationReason: report.moderation_reason ?? null,
    moderationReasonLabel: ownerReasonLabel(state, report.moderation_reason),
    moderationNote: report.moderation_note ?? null,
    location: {
      label: report.location_label ?? null,
      precision: report.location_precision,
      lat: report.location_precision === "hidden" ? null : report.lat ?? null,
      lng: report.location_precision === "hidden" ? null : report.lng ?? null,
      exactLat: exact.lat,
      exactLng: exact.lng,
    },
    evidence: evidence.map(adminEvidenceView),
    supportCount: report.support_count,
    commentCount: report.comment_count,
    corroborationCount: report.corroboration_count,
    evidenceStrength: report.evidence_strength,
  };
}

function runView(run: ModerationRun): RunView {
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    outcome: run.outcome ?? null,
    reasons: holdReasonList(run.reasons),
    aiStatus: run.ai_status ?? null,
    aiRecommendation: run.ai_recommendation ?? null,
    aiConfidence: run.ai_confidence ?? null,
    safetyRisk: run.safety_risk ?? null,
    attempts: run.attempts,
    maxAttempts: run.max_attempts,
    contentVersion: run.content_version,
    error: run.error ?? null,
    createdAt: run.created_at,
    startedAt: run.started_at ?? null,
    finishedAt: run.finished_at ?? null,
    imagesAssessed: run.images_assessed ?? null,
    keywordHitCount: Array.isArray(run.keyword_hits) ? run.keyword_hits.length : 0,
  };
}

function aiView(run: ModerationRun): AiAssessmentView {
  const verdicts = Array.isArray(run.ai_categories) ? run.ai_categories : [];
  return {
    runId: run.id,
    trigger: run.trigger,
    aiStatus: run.ai_status === "blocked" ? "blocked" : "assessed",
    outcome: run.outcome ?? null,
    recommendation: run.ai_recommendation ?? null,
    confidence: run.ai_confidence ?? null,
    summary: run.ai_summary ?? null,
    language: run.ai_language ?? null,
    safetyRisk: run.safety_risk ?? null,
    injectionSuspected: Boolean(run.injection_suspected),
    blockReason: run.block_reason ?? null,
    model: run.ai_model ?? null,
    policyVersion: run.policy_version ?? null,
    durationMs: run.ai_duration_ms ?? null,
    imagesAssessed: run.images_assessed ?? 0,
    categories: verdicts
      .filter((verdict) => isPolicyCategory(verdict?.code))
      .map((verdict) => ({
        code: verdict.code,
        label: ADMIN_TAB_LABELS[verdict.code],
        violation: Boolean(verdict.violation),
        confidence: Number(verdict.confidence) || 0,
        severity: verdict.severity,
        evidence: verdict.evidence || null,
        evidenceEnglish: verdict.evidenceEnglish || null,
      })),
    holdReasons: labelledHoldReasons(run.reasons),
    finishedAt: run.finished_at ?? null,
  };
}

function keywordHitViews(run: ModerationRun | null): KeywordHitView[] {
  const hits = run && Array.isArray(run.keyword_hits) ? run.keyword_hits : [];
  return hits
    .filter((hit) => isPolicyCategory(hit?.category))
    .map((hit) => ({ ...hit, categoryLabel: ADMIN_TAB_LABELS[hit.category] }));
}

/** The flag rows of a target (a report's own flags exclude its comments' flags). */
function flagTargetWhere(targetType: ModerationTargetType, targetId: string): Record<string, unknown> {
  return targetType === "comment" ? { comment_id: targetId } : { report_id: targetId, comment_id: null };
}

function flagTargetSql(targetType: ModerationTargetType, alias = "f"): string {
  return targetType === "comment"
    ? `${alias}.comment_id = :targetId`
    : `${alias}.report_id = :targetId AND ${alias}.comment_id IS NULL`;
}

/** The flag codes that count as safety flags, legacy spellings included. */
const SAFETY_FLAG_REASONS: string[] = [
  ...SAFETY_CATEGORIES,
  ...(Object.keys(LEGACY_FLAG_CODES) as LegacyFlagCode[]).filter((code) =>
    SAFETY_CATEGORIES.includes(LEGACY_FLAG_CODES[code]),
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// The service
// ─────────────────────────────────────────────────────────────────────────────

class ModerationAdminService {
  // ── Queue ───────────────────────────────────────────────────────────────

  /** `GET /cases` — one page of cases plus the total for the pagination block. */
  async listCases(query: CaseListQuery): Promise<{ items: CaseListItem[]; total: number }> {
    const { clauses, replacements } = caseListWhere(query);
    const from = `FROM moderation_cases c
       JOIN reports r ON r.id = c.report_id
       LEFT JOIN report_comments cm ON c.target_type = 'comment' AND cm.id = c.target_id
       LEFT JOIN app_users u ON u.deleted_on IS NULL
            AND u.id = CASE WHEN c.target_type = 'comment' THEN cm.user_id ELSE r.user_id END
      WHERE ${clauses.join(" AND ")}`;

    const [rows, counted] = await Promise.all([
      sequelize.query<CaseListRow>(
        `SELECT c.id, c.target_type, c.target_id, c.report_id, c.state, c.resolution, c.resolved_at,
                c.ai_flagged, c.keyword_flagged, c.media_review, c.user_flag_count, c.categories,
                c.hold_reasons, c.priority, c.urgent, c.safety_risk, c.opened_at, c.last_signal_at,
                r.case_ref, r.title AS report_title, r.category, r.visibility, r.location_label,
                r.filed_at, r.moderation_state AS report_state,
                cm.body AS comment_body, cm.created_at AS comment_created_at,
                cm.moderation_state AS comment_state,
                u.id AS author_id, u.display_name AS author_name
           ${from}
          ORDER BY ${caseOrderSql(query.sort, query.state)}
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

    const items = rows.map((row): CaseListItem => {
      const isComment = row.target_type === "comment";
      return {
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        title: isComment && row.comment_body ? clipText(row.comment_body, COMMENT_TITLE_CHARS) : row.report_title,
        report: { id: row.report_id, caseRef: row.case_ref, title: row.report_title },
        author: row.author_id ? { id: row.author_id, displayName: row.author_name ?? "" } : null,
        category: row.category,
        visibility: row.visibility,
        location: row.location_label,
        urgent: Boolean(row.urgent),
        safetyRisk: row.safety_risk,
        submittedAt: (isComment ? row.comment_created_at : row.filed_at) ?? row.filed_at,
        openedAt: row.opened_at,
        lastSignalAt: row.last_signal_at,
        sources: caseSources(row),
        userFlagCount: Number(row.user_flag_count),
        categories: categoryList(row.categories),
        holdReasons: holdReasonList(row.hold_reasons),
        priority: Number(row.priority),
        targetState: (isComment ? row.comment_state : row.report_state) ?? row.report_state,
        state: row.state,
        resolution: row.resolution,
        resolvedAt: row.resolved_at,
      };
    });
    return { items, total: counted[0]?.total ?? 0 };
  }

  /** `GET /cases/summary` — open counts per tab, plus urgent and safety. */
  async caseSummary(): Promise<CaseSummary> {
    const selects: string[] = ["CAST(COUNT(*) AS integer) AS \"all\""];
    const replacements: Record<string, unknown> = {};
    MODERATION_QUEUE_TABS.forEach((tab, index) => {
      const fragment = caseTabFilter(tab, "mc", `tab${index}`);
      if (!fragment) return;
      selects.push(`CAST(COUNT(*) FILTER (WHERE ${fragment.sql}) AS integer) AS "tab_${tab}"`);
      Object.assign(replacements, fragment.replacements);
    });
    selects.push(
      "CAST(COUNT(*) FILTER (WHERE mc.urgent) AS integer) AS urgent",
      "CAST(COUNT(*) FILTER (WHERE mc.safety_risk IS NOT NULL AND mc.safety_risk <> 'none') AS integer) AS safety",
      "CAST(COUNT(*) FILTER (WHERE mc.target_type = 'report') AS integer) AS reports",
      "CAST(COUNT(*) FILTER (WHERE mc.target_type = 'comment') AS integer) AS comments",
    );
    const rows = await sequelize.query<Record<string, number>>(
      `SELECT ${selects.join(",\n              ")} FROM moderation_cases mc WHERE mc.state = 'open'`,
      { replacements, type: QueryTypes.SELECT },
    );
    const row = rows[0] ?? {};
    const tabs = {} as Record<ModerationQueueTab, number>;
    for (const tab of MODERATION_QUEUE_TABS) {
      tabs[tab] = Number(tab === "all" ? row.all : row[`tab_${tab}`]) || 0;
    }
    return {
      open: tabs.all,
      tabs,
      urgent: Number(row.urgent) || 0,
      safety: Number(row.safety) || 0,
      byTargetType: { report: Number(row.reports) || 0, comment: Number(row.comments) || 0 },
    };
  }

  // ── Detail ──────────────────────────────────────────────────────────────

  /** `GET /cases/:id` — everything a moderator needs to decide once (§8.1, §8.2). */
  async caseDetail(caseId: string): Promise<CaseDetail> {
    const kase = await moderationCaseService.findById(null, caseId);
    if (!kase) throw notFound(CASE_GONE);
    const report = await Report.findByPk(kase.report_id);
    if (!report) throw notFound("The report this case is about no longer exists.");
    const comment = kase.target_type === "comment" ? await ReportComment.findByPk(kase.target_id) : null;

    const targetType = kase.target_type;
    const targetId = kase.target_id;
    const authorId = targetType === "comment" ? comment?.user_id ?? null : report.user_id ?? null;
    const anonymousOnThisItem = targetType === "comment" ? Boolean(comment?.anonymous) : Boolean(report.anonymous);

    const [reportView, runs, aiRun, lastDone, flags, previous, author, history, commentAuthor, resolvedByRefs] =
      await Promise.all([
        buildAdminReportView(report),
        ModerationRun.findAll({
          where: { target_type: targetType, target_id: targetId },
          order: [["created_at", "DESC"]],
          limit: RUN_LIMIT,
        }),
        ModerationRun.findOne({
          where: { target_type: targetType, target_id: targetId, status: "done", ai_status: { [Op.in]: ["assessed", "blocked"] } },
          order: [["finished_at", "DESC"]],
        }),
        ModerationRun.findOne({
          where: { target_type: targetType, target_id: targetId, status: "done" },
          order: [["finished_at", "DESC"]],
        }),
        this.userFlags(targetType, targetId),
        this.previousRejection(kase),
        this.authorView(authorId, anonymousOnThisItem),
        this.history(kase),
        comment ? AppUser.findByPk(comment.user_id, { attributes: ["id", "display_name"] }) : Promise.resolve(null),
        loadAdminRefs([kase.resolved_by]),
      ]);

    const commentView: AdminCommentView | null = comment
      ? {
          id: comment.id,
          reportId: comment.report_id,
          parentId: comment.parent_id ?? null,
          body: comment.body,
          anonymous: comment.anonymous,
          status: comment.status,
          moderationState: comment.moderation_state,
          moderationReason: comment.moderation_reason ?? null,
          moderationReasonLabel: rejectReasonLabel(comment.moderation_reason),
          createdAt: comment.created_at,
          moderatedAt: comment.moderated_at ?? null,
          likeCount: comment.like_count,
          author: commentAuthor ? { id: commentAuthor.id, displayName: commentAuthor.display_name ?? "" } : null,
        }
      : null;

    return {
      case: this.caseView(kase, resolvedByRefs.get(kase.resolved_by ?? "") ?? null),
      target: { report: reportView, comment: commentView },
      author,
      ai: aiRun ? aiView(aiRun) : null,
      keywordHits: keywordHitViews(lastDone),
      userFlags: flags,
      previousRejection: previous,
      history,
      runs: runs.map(runView),
    };
  }

  /** `GET /cases/:id/evidence/:evidenceId` — a presigned link to a sealed file of the case's report. */
  async caseEvidenceUrl(caseId: string, evidenceId: string): Promise<EvidenceLink> {
    const kase = await moderationCaseService.findById(null, caseId);
    if (!kase) throw notFound(CASE_GONE);
    const row = await ReportEvidence.findOne({ where: { id: evidenceId, report_id: kase.report_id } });
    if (!row || row.upload_state !== "sealed") throw notFound("That file is not available on this case.");
    return evidenceLinkFor(row);
  }

  // ── Decisions ───────────────────────────────────────────────────────────

  /**
   * `POST /cases/:id/approve` — Approve & Publish, Keep Published, Keep Comment.
   *
   * `evidenceIds` (review Q6) are the files the moderator was shown: only
   * those, and only if sealed on this report, are approved at scope `full`.
   * `contentVersion` fences the text, but sealing a file never bumps it, and
   * owners can add files to held, approved and rejected reports — so approving
   * "every sealed file" at the click released photos sealed after the detail
   * was rendered, at full resolution, on a human approval nobody gave them.
   * Any pending sealed file left over gets its own automated `evidence` run
   * instead (the report is approved now, so the late-evidence path applies):
   * never published silently, never stranded.
   */
  async approveCase(
    actor: AdminActor,
    caseId: string,
    input: { internalNote?: string | null; contentVersion?: number; evidenceIds?: readonly string[] | null },
  ): Promise<CaseDecisionResult> {
    const pendingPushes: PendingPush[] = [];
    let flags: ResolvedFlagRow[] = [];
    let evidenceRunQueued = false;

    const result = await adminTransaction(async (tx): Promise<CaseDecisionResult> => {
      const ctx = await this.lockCaseTarget(tx, caseId);
      await assertNotSelf(tx, actor, await this.selfSubject(tx, ctx, "moderation.approve"));
      this.assertDecidable(ctx);
      const kase = ctx.kase;
      const report = ctx.report as Report;
      if (!ctx.comment && input.contentVersion !== undefined && input.contentVersion !== report.content_version) {
        throw conflict(CONTENT_CHANGED);
      }

      const resolved = await moderationCaseService.resolveCase(tx, kase.id, {
        resolution: "approved",
        resolvedBy: actor.id,
        internalNote: input.internalNote ?? null,
      });
      if (!resolved) throw conflict(ALREADY_DECIDED);

      let before: { moderationState: string; status: string };
      let after: { moderationState: string; status: string };
      let evidenceApproved = 0;
      let runsCancelled = 0;
      let firstPublish = false;

      if (ctx.comment) {
        const comment = ctx.comment;
        before = { moderationState: comment.moderation_state, status: comment.status };
        await approveComment(tx, report, comment, pendingPushes);
        runsCancelled = await cancelQueuedRunsForTarget(tx, "comment", comment.id);
        flags = await moderationCaseService.resolveOpenFlags(tx, "comment", comment.id, {
          ...NO_ACTION.outcome,
          resolvedBy: actor.id,
        });
        after = { moderationState: "approved", status: comment.status };
      } else {
        before = { moderationState: report.moderation_state, status: report.status };
        const wasLive = report.moderation_state === "approved";
        firstPublish = !wasLive && !report.published_at;
        const now = nowIso();
        await report.update(
          {
            moderation_state: "approved",
            moderated_at: now,
            approved_content_version: report.content_version,
            // D8: a human cleared this version; it is never auto-hidden again.
            human_reviewed_version: report.content_version,
            published_at: report.published_at ?? now,
            moderation_reason: null,
            moderation_note: null,
          },
          { transaction: tx },
        );
        // A human looked at the files they were shown (§11a, review R5): those
        // that are pending are approved in full, and a thumbnail-only approval
        // among them is upgraded. Review Q6: *only* the ones the console
        // rendered (`evidenceIds`), and only sealed ones on this report — a
        // file sealed after the moderator opened the case was never on their
        // screen. No list, no file approved. Sealing locks the report row
        // first, and this transaction holds it, so the set cannot change under us.
        evidenceApproved = (
          await approveEvidence(tx, {
            reportId: report.id,
            ids: await sealedEvidenceIds(tx, report.id, input.evidenceIds ?? []),
            scope: "full",
          })
        ).length;
        runsCancelled = await cancelQueuedRunsForTarget(tx, "report", report.id);
        // Whatever is still pending — sealed after the render, or left off the
        // list — is checked like any file added to a live report (§5.1): its
        // own `evidence` run, queued after the cancel above so the queued run
        // withdrawn with the case cannot take these files with it.
        evidenceRunQueued = await queueLeftoverEvidenceRun(tx, report);
        flags = await moderationCaseService.resolveOpenFlags(tx, "report", report.id, {
          ...NO_ACTION.outcome,
          resolvedBy: actor.id,
        });
        if (!wasLive) {
          await this.notifyMember(
            tx,
            report.user_id ?? null,
            report,
            firstPublish ? OWNER_NOTIFICATIONS.live : OWNER_NOTIFICATIONS.liveAgain,
            null,
            pendingPushes,
          );
        }
        after = { moderationState: "approved", status: report.status };
      }

      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "moderation.approve",
        targetType: kase.target_type,
        targetId: kase.target_id,
        reportId: kase.report_id,
        caseId: kase.id,
        note: input.internalNote ?? null,
        metadata: {
          before,
          after,
          ...(ctx.comment
            ? {}
            : {
                contentVersion: report.content_version,
                evidenceShown: input.evidenceIds?.length ?? 0,
                evidenceRecheckQueued: evidenceRunQueued,
              }),
          evidenceApproved,
          flagsDismissed: flags.length,
          runsCancelled,
          firstPublish,
        },
        ip: actor.ip,
      });

      return {
        caseId: kase.id,
        resolution: "approved",
        targetType: kase.target_type,
        targetId: kase.target_id,
        reportId: kase.report_id,
        targetState: "approved",
        evidenceApproved,
        flagsResolved: flags.length,
        runsCancelled,
        firstPublish,
      };
    });

    dispatchAfterCommit(pendingPushes);
    flagService.notifyReporters(flags, NO_ACTION.mail);
    // After the commit, never inside it — the worker must see the committed row.
    if (evidenceRunQueued) pokeModeration();
    logger.info("[moderation] case approved", {
      caseId,
      targetType: result.targetType,
      firstPublish: result.firstPublish,
      evidenceApproved: result.evidenceApproved,
      evidenceRecheckQueued: evidenceRunQueued,
      adminId: actor.id,
    });
    return result;
  }

  /** `POST /cases/:id/reject` — Reject, Reject & Take Down, Remove Comment. */
  async rejectCase(
    actor: AdminActor,
    caseId: string,
    input: {
      reasonCode: RejectReasonCode;
      publicNote?: string | null;
      internalNote?: string | null;
      contentVersion?: number;
    },
  ): Promise<CaseDecisionResult> {
    assertReason("reject", input.reasonCode, input.publicNote);
    const label = rejectReasonLabel(input.reasonCode);
    const publicNote = input.publicNote?.trim() || null;
    const pendingPushes: PendingPush[] = [];
    let flags: ResolvedFlagRow[] = [];

    const result = await adminTransaction(async (tx): Promise<CaseDecisionResult> => {
      const ctx = await this.lockCaseTarget(tx, caseId);
      await assertNotSelf(tx, actor, await this.selfSubject(tx, ctx, "moderation.reject"));
      this.assertDecidable(ctx);
      const kase = ctx.kase;
      const report = ctx.report as Report;
      if (!ctx.comment && input.contentVersion !== undefined && input.contentVersion !== report.content_version) {
        throw conflict(CONTENT_CHANGED);
      }

      const resolved = await moderationCaseService.resolveCase(tx, kase.id, {
        resolution: "rejected",
        resolvedBy: actor.id,
        reasonCode: input.reasonCode,
        publicNote,
        internalNote: input.internalNote ?? null,
      });
      if (!resolved) throw conflict(ALREADY_DECIDED);

      let before: { moderationState: string; status: string };
      let after: { moderationState: string; status: string };
      let runsCancelled = 0;

      if (ctx.comment) {
        const comment = ctx.comment;
        before = { moderationState: comment.moderation_state, status: comment.status };
        await setCommentState(tx, comment.id, { moderationState: "rejected", moderationReason: input.reasonCode });
        runsCancelled = await cancelQueuedRunsForTarget(tx, "comment", comment.id);
        flags = await moderationCaseService.resolveOpenFlags(tx, "comment", comment.id, {
          ...ACTION_TAKEN.outcome,
          resolvedBy: actor.id,
        });
        // The commenter reads the reason label and the moderator's note, as a
        // report author does (§8.2 "note shown to the author") — staff text and
        // catalogue labels only, never the removed comment itself.
        await this.notifyMember(
          tx,
          comment.user_id,
          report,
          OWNER_NOTIFICATIONS.commentRemoved,
          decisionNoticeBody(label, publicNote, OWNER_NOTIFICATIONS.commentRemoved.body),
          pendingPushes,
          `/r/${report.case_ref}/comments`,
        );
        after = { moderationState: "rejected", status: comment.status };
      } else {
        before = { moderationState: report.moderation_state, status: report.status };
        await report.update(
          {
            moderation_state: "rejected",
            moderation_reason: input.reasonCode,
            moderation_note: publicNote,
            moderated_at: nowIso(),
            // Review Q7: a human refused this version, so no version stands
            // approved any more. This is what records the resubmission debt
            // durably: whichever way the report later leaves `rejected` (an
            // edit, or Reactivate), `awaitsResubmissionCheck` sees a
            // `resubmitted` run no approval has covered — even when the report
            // had been live at this very version — until a human approves.
            approved_content_version: null,
          },
          { transaction: tx },
        );
        runsCancelled = await cancelQueuedRunsForTarget(tx, "report", report.id);
        flags = await moderationCaseService.resolveOpenFlags(tx, "report", report.id, {
          ...ACTION_TAKEN.outcome,
          resolvedBy: actor.id,
        });
        await this.notifyMember(
          tx,
          report.user_id ?? null,
          report,
          OWNER_NOTIFICATIONS.notPublished,
          decisionNoticeBody(label, publicNote, OWNER_NOTIFICATIONS.notPublished.body),
          pendingPushes,
        );
        after = { moderationState: "rejected", status: report.status };
      }

      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "moderation.reject",
        targetType: kase.target_type,
        targetId: kase.target_id,
        reportId: kase.report_id,
        caseId: kase.id,
        reasonCode: input.reasonCode,
        note: input.internalNote ?? null,
        metadata: {
          before,
          after,
          ...(ctx.comment ? {} : { contentVersion: report.content_version }),
          publicNote: publicNote !== null,
          flagsResolved: flags.length,
          runsCancelled,
        },
        ip: actor.ip,
      });

      return {
        caseId: kase.id,
        resolution: "rejected",
        targetType: kase.target_type,
        targetId: kase.target_id,
        reportId: kase.report_id,
        targetState: "rejected",
        evidenceApproved: 0,
        flagsResolved: flags.length,
        runsCancelled,
        firstPublish: false,
      };
    });

    dispatchAfterCommit(pendingPushes);
    flagService.notifyReporters(flags, ACTION_TAKEN.mail);
    logger.info("[moderation] case rejected", {
      caseId,
      targetType: result.targetType,
      reason: input.reasonCode,
      adminId: actor.id,
    });
    return result;
  }

  /**
   * `POST /cases/:id/evidence/:evidenceId/reject` — hide one file from members
   * for good (D22). The report stays as it is; the case stays open for the
   * moderator's decision on the rest.
   */
  async rejectEvidence(
    actor: AdminActor,
    caseId: string,
    evidenceId: string,
    input: { reasonCode?: RejectReasonCode | null; internalNote?: string | null },
  ): Promise<EvidenceRejectResult> {
    if (input.reasonCode) assertReason("reject", input.reasonCode, input.internalNote);

    const result = await adminTransaction(async (tx): Promise<EvidenceRejectResult> => {
      const peek = await moderationCaseService.findById(tx, caseId);
      if (!peek) throw notFound(CASE_GONE);
      // Report → case: the files belong to the report, and this is the order
      // every other writer takes.
      const report = await Report.findByPk(peek.report_id, { transaction: tx, lock: tx.LOCK.UPDATE });
      const kase = await moderationCaseService.findById(tx, caseId, { lock: true });
      if (!kase) throw notFound(CASE_GONE);
      const ctx: CaseTargetContext = { kase, report, comment: null };

      // The files are the *report's*, whichever case this call arrives
      // through. Review Q3: on a comment case, `caseFlaggerIds` names only the
      // comment's flaggers, so a moderator refused on the report's own case
      // ("You flagged this yourself") could hide the report's files through a
      // comment case on it instead. The report's flaggers are always checked.
      const flaggerIds = [
        ...(await this.caseFlaggerIds(tx, kase)),
        ...(kase.target_type === "comment" ? await this.reportFlaggerIds(tx, kase.report_id) : []),
      ];
      await assertNotSelf(tx, actor, {
        action: "evidence.reject",
        targetType: "evidence",
        targetId: evidenceId,
        reportId: kase.report_id,
        caseId: kase.id,
        authorIds: [report?.user_id ?? null],
        flaggerIds,
      });
      if (kase.state !== "open") throw conflict(ALREADY_DECIDED);
      this.assertReportDecidable(ctx);

      const row = await ReportEvidence.findOne({
        where: { id: evidenceId, report_id: kase.report_id },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (!row) throw notFound("That file is not part of this case's report.");
      if (row.moderation_state === "rejected") throw conflict("That file is already hidden from members.");

      const before = { moderationState: row.moderation_state, approvedScope: row.approved_scope ?? null };
      await row.update({ moderation_state: "rejected", approved_scope: null }, { transaction: tx });
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "evidence.reject",
        targetType: "evidence",
        targetId: row.id,
        reportId: kase.report_id,
        caseId: kase.id,
        reasonCode: input.reasonCode ?? null,
        note: input.internalNote ?? null,
        metadata: { before, after: { moderationState: "rejected", approvedScope: null }, kind: row.kind },
        ip: actor.ip,
      });
      return { caseId: kase.id, evidenceId: row.id, moderationState: "rejected", approvedScope: null };
    });

    logger.info("[moderation] evidence hidden", { caseId, evidenceId, adminId: actor.id });
    return result;
  }

  /** `POST /cases/:id/rerun` — held → pending + a `manual` run (§5.1), then wake the worker. */
  async rerunCase(actor: AdminActor, caseId: string): Promise<RerunResponse> {
    const result = await adminTransaction(async (tx): Promise<RerunResponse> => {
      const peek = await moderationCaseService.findById(tx, caseId);
      if (!peek) throw notFound(CASE_GONE);
      // Unlocked reads for the self-check; `requestRerun` takes the locks in
      // the module's order and re-checks everything under them.
      const report = await Report.findByPk(peek.report_id, {
        attributes: ["id", "user_id", "moderation_state", "deleted_at"],
        transaction: tx,
      });
      const comment =
        peek.target_type === "comment"
          ? await ReportComment.findByPk(peek.target_id, { attributes: ["id", "user_id"], transaction: tx })
          : null;
      const flaggerIds = await this.caseFlaggerIds(tx, peek);
      await assertNotSelf(tx, actor, {
        action: "moderation.rerun",
        targetType: peek.target_type,
        targetId: peek.target_id,
        reportId: peek.report_id,
        caseId: peek.id,
        authorIds: [peek.target_type === "comment" ? comment?.user_id ?? null : report?.user_id ?? null],
        flaggerIds,
      });
      if (report?.moderation_state === "deactivated") {
        throw conflict("This incident was deactivated. Reactivate it in Incident Management first.");
      }

      const rerun = await requestRerun(tx, { caseId, actor: { kind: "admin", id: actor.id, ip: actor.ip } });
      if (!rerun.ok) throw rerunRefusal(rerun.reason);
      return { caseId, runId: rerun.runId };
    });

    // After the commit, never inside it — the worker must see the committed row.
    pokeModeration();
    logger.info("[moderation] re-run requested", { caseId, runId: result.runId, adminId: actor.id });
    return result;
  }

  // ── Member enforcement ──────────────────────────────────────────────────

  /**
   * `POST /members/:id/ban` — permanent ban. `banned` is refused at login and
   * refresh, and every session is revoked here because `userAuthGuard` checks
   * the session, not the status (§7.9). Content decisions are unchanged: the
   * pipeline holds a banned author's pending items as `author_banned`.
   *
   * Review Q2 — §7.9 "their open flags stop triggering AI": every open flag
   * the member raised is dismissed in this transaction (`dismissBannedFlags`),
   * so it no longer counts towards a case's `user_flag_count` or priority, and
   * a queued `flagged` re-check left with no open flag behind it is withdrawn.
   * The pipeline also ignores open flags from any reporter who is not active
   * (`flaggedCategoriesFor`), which covers a run already in flight.
   */
  async banMember(
    actor: AdminActor,
    memberId: string,
    input: { reasonCode: string; note?: string | null; caseId?: string | null },
  ): Promise<MemberStatusResult> {
    assertReason("ban", input.reasonCode, input.note);
    let evidenceRunQueued = false;

    const result = await adminTransaction(async (tx): Promise<MemberStatusResult> => {
      const link = await this.caseLink(tx, input.caseId ?? null, memberId);
      const member = await AppUser.findByPk(memberId, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!member || member.status === "deleted") throw notFound("That member does not exist.");
      await assertNotSelf(tx, actor, {
        action: "member.ban",
        targetType: "member",
        targetId: member.id,
        reportId: link.reportId,
        caseId: link.caseId,
        memberId: member.id,
      });
      if (member.status === "banned") throw conflict("That member is already banned.");

      const before = { status: member.status };
      await member.update({ status: "banned" }, { transaction: tx });
      const [sessionsRevoked] = await UserSession.update(
        { revoked_at: nowIso(), push_token: null },
        { where: { user_id: member.id, revoked_at: null }, transaction: tx },
      );
      const dismissed = await this.dismissBannedFlags(tx, actor, member.id);
      evidenceRunQueued = dismissed.evidenceRunsQueued > 0;
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "member.ban",
        targetType: "member",
        targetId: member.id,
        reportId: link.reportId,
        caseId: link.caseId,
        reasonCode: input.reasonCode,
        note: input.note ?? null,
        metadata: {
          before,
          after: { status: "banned" },
          sessionsRevoked,
          reasonLabel: banReasonLabel(input.reasonCode),
          flagsDismissed: dismissed.flags,
          recheckRunsCancelled: dismissed.runsCancelled,
        },
        ip: actor.ip,
      });
      return { memberId: member.id, status: "banned", sessionsRevoked };
    });

    // After the commit — a withdrawn re-check's pending files got their own run.
    if (evidenceRunQueued) pokeModeration();
    logger.info("[moderation] member banned", {
      memberId,
      reason: input.reasonCode,
      sessionsRevoked: result.sessionsRevoked,
      adminId: actor.id,
    });
    return result;
  }

  /**
   * `POST /members/:id/unban` — banned → active. Sessions are not restored;
   * they sign in again. Flags the ban dismissed stay dismissed (review Q2):
   * the cases they sat on have been worked on since without them, and
   * reviving them would re-steer priority and the AI behind the moderators'
   * backs.
   */
  async unbanMember(
    actor: AdminActor,
    memberId: string,
    input: { note?: string | null; caseId?: string | null },
  ): Promise<MemberStatusResult> {
    const result = await adminTransaction(async (tx): Promise<MemberStatusResult> => {
      const link = await this.caseLink(tx, input.caseId ?? null, memberId);
      const member = await AppUser.findByPk(memberId, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!member || member.status === "deleted") throw notFound("That member does not exist.");
      await assertNotSelf(tx, actor, {
        action: "member.unban",
        targetType: "member",
        targetId: member.id,
        reportId: link.reportId,
        caseId: link.caseId,
        memberId: member.id,
      });
      if (member.status !== "banned") throw conflict("That member is not banned.");

      await member.update({ status: "active" }, { transaction: tx });
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.id,
        action: "member.unban",
        targetType: "member",
        targetId: member.id,
        reportId: link.reportId,
        caseId: link.caseId,
        note: input.note ?? null,
        metadata: { before: { status: "banned" }, after: { status: "active" } },
        ip: actor.ip,
      });
      return { memberId: member.id, status: "active", sessionsRevoked: 0 };
    });

    logger.info("[moderation] member unbanned", { memberId, adminId: actor.id });
    return result;
  }

  // ── Stats, broadcast ────────────────────────────────────────────────────

  /** `GET /stats` — the queue's health, and the two promises the mobile copy makes (§8.1, §10). */
  async stats(): Promise<ModerationStats> {
    const now = Date.now();
    const iso = (ms: number): string => new Date(ms).toISOString();
    const slaMinutes = env.reports.urgentSlaMinutes;

    const [cases, urgentBreached, safetyBreached, runs, languages] = await Promise.all([
      sequelize.query<{
        open_cases: number;
        ai: number;
        keyword: number;
        user_flags: number;
        media: number;
        urgent_open: number;
        safety_open: number;
        oldest_opened_at: string | null;
      }>(
        `SELECT CAST(COUNT(*) AS integer) AS open_cases,
                CAST(COUNT(*) FILTER (WHERE ai_flagged) AS integer) AS ai,
                CAST(COUNT(*) FILTER (WHERE keyword_flagged) AS integer) AS keyword,
                CAST(COUNT(*) FILTER (WHERE user_flag_count > 0) AS integer) AS user_flags,
                CAST(COUNT(*) FILTER (WHERE media_review) AS integer) AS media,
                CAST(COUNT(*) FILTER (WHERE urgent) AS integer) AS urgent_open,
                CAST(COUNT(*) FILTER (WHERE safety_risk IS NOT NULL AND safety_risk <> 'none') AS integer) AS safety_open,
                MIN(opened_at) AS oldest_opened_at
           FROM moderation_cases
          WHERE state = 'open'`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query<{ n: number }>(
        `SELECT CAST(COUNT(*) AS integer) AS n
           FROM reports
          WHERE deleted_at IS NULL AND urgent = true AND status = 'submitted'
            AND assigned_admin_id IS NULL AND filed_at < :cutoff`,
        { replacements: { cutoff: iso(now - slaMinutes * 60_000) }, type: QueryTypes.SELECT },
      ),
      sequelize.query<{ n: number }>(
        `SELECT CAST(COUNT(DISTINCT c.id) AS integer) AS n
           FROM moderation_cases c
           JOIN report_flags f
             ON f.status = 'open'
            AND ((c.target_type = 'report' AND f.report_id = c.target_id AND f.comment_id IS NULL)
              OR (c.target_type = 'comment' AND f.comment_id = c.target_id))
          WHERE c.state = 'open' AND f.reason IN (:reasons) AND f.created_at < :cutoff`,
        {
          replacements: { reasons: SAFETY_FLAG_REASONS, cutoff: iso(now - SAFETY_FLAG_SLA_MINUTES * 60_000) },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query<{ runs_queued: number; failed_last_hour: number; auto_approved: number; held: number }>(
        `SELECT CAST(COUNT(*) FILTER (WHERE status = 'queued') AS integer) AS runs_queued,
                CAST(COUNT(*) FILTER (WHERE status = 'done' AND finished_at >= :hourAgo
                       AND (ai_status IN ('unavailable', 'error')
                            OR reasons @> CAST(:systemError AS jsonb))) AS integer) AS failed_last_hour,
                CAST(COUNT(*) FILTER (WHERE status = 'done' AND finished_at >= :dayAgo
                       AND outcome = 'approve') AS integer) AS auto_approved,
                CAST(COUNT(*) FILTER (WHERE status = 'done' AND finished_at >= :dayAgo
                       AND outcome IN ('hold', 'hide')) AS integer) AS held
           FROM moderation_runs
          WHERE status = 'queued' OR finished_at >= :dayAgo`,
        {
          replacements: {
            hourAgo: iso(now - 60 * 60_000),
            dayAgo: iso(now - 24 * 60 * 60_000),
            systemError: JSON.stringify(["system_error"]),
          },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query<{ language: string; assessed: number; held: number }>(
        `SELECT COALESCE(ai_language, 'und') AS language,
                CAST(COUNT(*) AS integer) AS assessed,
                CAST(COUNT(*) FILTER (WHERE outcome IN ('hold', 'hide')) AS integer) AS held
           FROM moderation_runs
          WHERE status = 'done' AND ai_status = 'assessed' AND finished_at >= :weekAgo
            AND outcome IN ('approve', 'hold', 'hide')
          GROUP BY COALESCE(ai_language, 'und')
          ORDER BY assessed DESC, language ASC
          LIMIT 20`,
        { replacements: { weekAgo: iso(now - 7 * 24 * 60 * 60_000) }, type: QueryTypes.SELECT },
      ),
    ]);

    const open = cases[0];
    const oldest = open?.oldest_opened_at ? Date.parse(open.oldest_opened_at) : NaN;
    const run = runs[0];
    return {
      openCases: open?.open_cases ?? 0,
      bySource: {
        ai: open?.ai ?? 0,
        keyword: open?.keyword ?? 0,
        user: open?.user_flags ?? 0,
        media: open?.media ?? 0,
      },
      urgentOpen: open?.urgent_open ?? 0,
      safetyOpen: open?.safety_open ?? 0,
      urgentUnassignedBreached: urgentBreached[0]?.n ?? 0,
      safetyFlagBreached: safetyBreached[0]?.n ?? 0,
      oldestOpenMinutes: Number.isFinite(oldest) ? Math.max(0, Math.round((now - oldest) / 60_000)) : 0,
      runsQueued: run?.runs_queued ?? 0,
      runsFailedLastHour: run?.failed_last_hour ?? 0,
      autoApprovedLast24h: run?.auto_approved ?? 0,
      heldLast24h: run?.held ?? 0,
      heldRateByLanguage: languages.map((row) => ({
        language: row.language,
        assessed: row.assessed,
        held: row.held,
        rate: row.assessed > 0 ? Math.round((row.held / row.assessed) * 1000) / 1000 : 0,
      })),
      slaMinutes,
      safetyFlagSlaMinutes: SAFETY_FLAG_SLA_MINUTES,
      generatedAt: iso(now),
    };
  }

  /**
   * `POST /broadcast` — A11's urgent area notice. Bypasses every recipient's
   * preference, because the screen promises it will ("These cannot be turned off").
   */
  async broadcast(area: string, title: string, body: string): Promise<{ recipients: number }> {
    return notificationService.broadcastUrgent(area, title, body);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Lock the case's target (report, or comment → report), then the case — §5.4. */
  private async lockCaseTarget(tx: Transaction, caseId: string): Promise<CaseTargetContext> {
    const peek = await moderationCaseService.findById(tx, caseId);
    if (!peek) throw notFound(CASE_GONE);

    let report: Report | null;
    let comment: ReportComment | null = null;
    if (peek.target_type === "comment") {
      comment = await ReportComment.findByPk(peek.target_id, { transaction: tx, lock: tx.LOCK.UPDATE });
      // `NO KEY UPDATE`, as the pipeline takes it (review R4): two comment
      // decisions on one report both update `comment_count` and must not
      // deadlock each other.
      report = await Report.findOne({
        where: { id: comment?.report_id ?? peek.report_id },
        transaction: tx,
        lock: tx.LOCK.NO_KEY_UPDATE,
      });
    } else {
      report = await Report.findByPk(peek.target_id, { transaction: tx, lock: tx.LOCK.UPDATE });
    }

    const kase = await moderationCaseService.findById(tx, caseId, { lock: true });
    if (!kase) throw notFound(CASE_GONE);
    return { kase, report, comment };
  }

  /** The members who flagged the item on this case (or hold an open flag on it). */
  private async caseFlaggerIds(tx: Transaction, kase: ModerationCaseRow): Promise<string[]> {
    const rows = await sequelize.query<{ reporter_id: string }>(
      `SELECT DISTINCT f.reporter_id
         FROM report_flags f
        WHERE f.reporter_id IS NOT NULL
          AND (f.case_id = :caseId OR (f.status = 'open' AND ${flagTargetSql(kase.target_type)}))`,
      { replacements: { caseId: kase.id, targetId: kase.target_id }, type: QueryTypes.SELECT, transaction: tx },
    );
    return rows.map((row) => row.reporter_id);
  }

  /**
   * The members who flagged the report itself (not its comments): an open flag
   * on it, or any flag on its open case — what `caseFlaggerIds` answers for
   * the report's own case. For decisions that act on the report through a
   * comment case (review Q3).
   */
  private async reportFlaggerIds(tx: Transaction, reportId: string): Promise<string[]> {
    const rows = await sequelize.query<{ reporter_id: string }>(
      `SELECT DISTINCT f.reporter_id
         FROM report_flags f
        WHERE f.reporter_id IS NOT NULL
          AND f.report_id = :reportId AND f.comment_id IS NULL
          AND (f.status = 'open'
               OR f.case_id IN (SELECT mc.id FROM moderation_cases mc
                                 WHERE mc.target_type = 'report' AND mc.target_id = :reportId
                                   AND mc.state = 'open'))`,
      { replacements: { reportId }, type: QueryTypes.SELECT, transaction: tx },
    );
    return rows.map((row) => row.reporter_id);
  }

  private async selfSubject(
    tx: Transaction,
    ctx: CaseTargetContext,
    action: AuditAction,
  ): Promise<SelfCheckSubject> {
    const authorId = ctx.kase.target_type === "comment" ? ctx.comment?.user_id ?? null : ctx.report?.user_id ?? null;
    return {
      action,
      targetType: ctx.kase.target_type,
      targetId: ctx.kase.target_id,
      reportId: ctx.kase.report_id,
      caseId: ctx.kase.id,
      authorIds: [authorId],
      flaggerIds: await this.caseFlaggerIds(tx, ctx.kase),
    };
  }

  /** 409 unless the case is open and its target still exists and is not deactivated. */
  private assertDecidable(ctx: CaseTargetContext): void {
    if (ctx.kase.state !== "open") throw conflict(ALREADY_DECIDED);
    this.assertReportDecidable(ctx);
    if (ctx.kase.target_type === "comment" && (!ctx.comment || ctx.comment.status !== "visible")) {
      throw conflict("That comment has been removed, so there is nothing left to decide.");
    }
  }

  private assertReportDecidable(ctx: CaseTargetContext): void {
    if (!ctx.report || ctx.report.deleted_at) {
      throw conflict("The report this case is about has been deleted, so there is nothing left to decide.");
    }
    if (ctx.report.moderation_state === "deactivated") {
      throw conflict(
        "This incident was deactivated, so its moderation case can't be decided. Reactivate it in Incident Management first.",
      );
    }
  }

  /**
   * An optional case reference on a ban/unban, resolved for the audit row's
   * links. Review Q5: the case must be *about this member* — they wrote its
   * target (the report, or the comment) or flagged it on that case. The row
   * lands in that case's History (`history()` selects by case id), so an
   * unrelated case id would file a ban of one member on another member's case.
   */
  private async caseLink(
    tx: Transaction,
    caseId: string | null,
    memberId: string,
  ): Promise<{ caseId: string | null; reportId: string | null }> {
    if (!caseId) return { caseId: null, reportId: null };
    const kase = await moderationCaseService.findById(tx, caseId);
    if (!kase) throw notFound(CASE_GONE);

    const target =
      kase.target_type === "comment"
        ? await ReportComment.findByPk(kase.target_id, { attributes: ["id", "user_id"], transaction: tx })
        : await Report.findByPk(kase.report_id, { attributes: ["id", "user_id"], transaction: tx });
    const involved = new Set<string>(await this.caseFlaggerIds(tx, kase));
    if (target?.user_id) involved.add(target.user_id);
    if (!involved.has(memberId)) throw badRequest(CASE_NOT_ABOUT_MEMBER);
    return { caseId: kase.id, reportId: kase.report_id };
  }

  /**
   * Review Q2: the banned member's open flags are dismissed, target by target,
   * in the module's lock order — the target row (a report; or a comment, then
   * its report `NO KEY UPDATE`), then its open case, then the flag rows — so a
   * ban cannot deadlock a decision or a pipeline apply on the same target.
   * Each case they sat on has its flag count, categories and priority
   * recounted from the flags still open (`recountFlagSignals`); a queued
   * `flagged` re-check left with no open flag from an active member is
   * withdrawn, and a report's pending files it would have read get their own
   * `evidence` run so they are not stranded. The member is not emailed. Each
   * dismissed flag is audited on its case, so the case History says why its
   * flag count dropped.
   */
  private async dismissBannedFlags(
    tx: Transaction,
    actor: AdminActor,
    memberId: string,
  ): Promise<{ flags: number; runsCancelled: number; evidenceRunsQueued: number }> {
    const open = await sequelize.query<{ report_id: string | null; comment_id: string | null }>(
      `SELECT DISTINCT report_id, comment_id
         FROM report_flags
        WHERE reporter_id = :memberId AND status = 'open'
        ORDER BY report_id, comment_id`,
      { replacements: { memberId }, type: QueryTypes.SELECT, transaction: tx },
    );
    const targets = bannedFlagTargets(open);
    let flags = 0;
    let runsCancelled = 0;
    let evidenceRunsQueued = 0;

    for (const target of targets) {
      let report: Report | null;
      if (target.targetType === "comment") {
        const comment = await ReportComment.findByPk(target.targetId, { transaction: tx, lock: tx.LOCK.UPDATE });
        report = comment
          ? await Report.findOne({ where: { id: comment.report_id }, transaction: tx, lock: tx.LOCK.NO_KEY_UPDATE })
          : null;
      } else {
        report = await Report.findByPk(target.targetId, { transaction: tx, lock: tx.LOCK.UPDATE });
      }
      const openCase = await moderationCaseService.findOpenCase(tx, target.targetType, target.targetId, {
        lock: true,
      });

      const dismissed = await sequelize.query<{ id: string; report_id: string | null; case_id: string | null }>(
        `UPDATE report_flags
            SET status = 'dismissed', resolution = :resolution, resolved_at = :now,
                resolved_by = :resolvedBy, updated_on = now()
          WHERE reporter_id = :memberId AND status = 'open' AND ${flagTargetSql(target.targetType, "report_flags")}
          RETURNING id, report_id, case_id`,
        {
          replacements: {
            memberId,
            targetId: target.targetId,
            resolution: BANNED_REPORTER_RESOLUTION,
            resolvedBy: actor.id,
            now: nowIso(),
          },
          type: QueryTypes.SELECT,
          transaction: tx,
        },
      );
      if (dismissed.length === 0) continue;
      flags += dismissed.length;

      if (openCase) await moderationCaseService.recountFlagSignals(tx, openCase);

      // A re-check this member's flag queued, with nobody active left behind it.
      const activeFlags = await sequelize.query<{ n: number }>(
        `SELECT CAST(COUNT(*) AS integer) AS n
           FROM report_flags f
           LEFT JOIN app_users u ON u.id = f.reporter_id
          WHERE f.status = 'open' AND ${flagTargetSql(target.targetType)}
            AND (u.id IS NULL OR u.status = 'active')`,
        { replacements: { targetId: target.targetId }, type: QueryTypes.SELECT, transaction: tx },
      );
      if ((activeFlags[0]?.n ?? 0) === 0) {
        const withdrawn = await sequelize.query<{ id: string }>(
          `UPDATE moderation_runs
              SET status = 'cancelled', outcome = 'noop', finished_at = :now, updated_on = now()
            WHERE target_type = :targetType AND target_id = :targetId
              AND status = 'queued' AND "trigger" = 'flagged'
            RETURNING id`,
          {
            replacements: { targetType: target.targetType, targetId: target.targetId, now: nowIso() },
            type: QueryTypes.SELECT,
            transaction: tx,
          },
        );
        runsCancelled += withdrawn.length;
        // A queued re-check is what the late-evidence path relied on to read
        // files sealed onto a live report meanwhile (`planLateEvidenceRun`
        // merges nothing into a `flagged` run). Withdrawn, they get their own.
        if (withdrawn.length > 0 && target.targetType === "report" && report && report.moderation_state === "approved") {
          if (await queueLeftoverEvidenceRun(tx, report)) evidenceRunsQueued += 1;
        }
      }

      for (const row of dismissed) {
        await auditService.record(tx, {
          actorKind: "admin",
          actorId: actor.id,
          action: "flag.dismiss",
          targetType: "flag",
          targetId: row.id,
          reportId: row.report_id ?? report?.id ?? null,
          caseId: row.case_id ?? openCase?.id ?? null,
          reasonCode: "reporter_banned",
          metadata: { by: "member.ban", memberId, target: target.targetType, targetId: target.targetId },
          ip: actor.ip,
        });
      }
    }
    return { flags, runsCancelled, evidenceRunsQueued };
  }

  /** An owner-facing notification written in `tx`; the push leaves after the commit. */
  private async notifyMember(
    tx: Transaction,
    userId: string | null,
    report: Report,
    copy: OwnerNotificationCopy,
    body: string | null,
    pendingPushes: PendingPush[],
    link: string = `/r/${report.case_ref}`,
  ): Promise<void> {
    // A severed report or an erased commenter has nobody left to tell.
    if (!userId) return;
    await notificationService.createInTx(
      tx,
      {
        userId,
        type: copy.type,
        title: copy.title,
        body: (body ?? copy.body) || undefined,
        link,
        reportId: report.id,
      },
      pendingPushes,
    );
  }

  private caseView(kase: ModerationCaseRow, resolvedBy: AdminRef | null): CaseView {
    return {
      id: kase.id,
      targetType: kase.target_type,
      targetId: kase.target_id,
      reportId: kase.report_id,
      commentId: kase.comment_id ?? null,
      state: kase.state,
      resolution: kase.resolution ?? null,
      resolutionReason: kase.resolution_reason ?? null,
      resolutionReasonLabel: kase.resolution === "rejected" ? rejectReasonLabel(kase.resolution_reason) : null,
      resolutionNote: kase.resolution_note ?? null,
      internalNote: kase.internal_note ?? null,
      resolvedAt: kase.resolved_at ?? null,
      resolvedBy,
      sources: caseSources(kase),
      userFlagCount: Number(kase.user_flag_count),
      categories: categoryList(kase.categories).map((code) => ({ code, label: ADMIN_TAB_LABELS[code] })),
      holdReasons: labelledHoldReasons(kase.hold_reasons),
      priority: Number(kase.priority),
      urgent: Boolean(kase.urgent),
      safetyRisk: kase.safety_risk ?? null,
      openedAt: kase.opened_at,
      lastSignalAt: kase.last_signal_at,
      latestRunId: kase.latest_run_id ?? null,
    };
  }

  /** The target's author for the detail's Author panel, with their history. */
  private async authorView(authorId: string | null, anonymousOnThisItem: boolean): Promise<CaseAuthorView | null> {
    if (!authorId) return null;
    const user = (await AppUser.findByPk(authorId, {
      attributes: ["id", "display_name", "email", "status", "created_on"],
      raw: true,
    })) as unknown as MemberRow | null;
    if (!user) return null;

    const [reports, rejected, commentsRemoved, flagsAgainst] = await Promise.all([
      Report.count({ where: { user_id: authorId, deleted_at: null } }),
      sequelize.query<{ n: number }>(
        `SELECT CAST(COUNT(*) AS integer) AS n
           FROM moderation_cases mc
           JOIN reports r ON r.id = mc.target_id
          WHERE mc.target_type = 'report' AND mc.resolution = 'rejected' AND r.user_id = :userId`,
        { replacements: { userId: authorId }, type: QueryTypes.SELECT },
      ),
      ReportComment.count({ where: { user_id: authorId, moderation_state: "rejected" } }),
      sequelize.query<{ n: number }>(
        `SELECT CAST(COUNT(*) AS integer) AS n
           FROM report_flags f
           LEFT JOIN reports r ON f.comment_id IS NULL AND r.id = f.report_id
           LEFT JOIN report_comments c ON c.id = f.comment_id
          WHERE (f.comment_id IS NULL AND r.user_id = :userId) OR c.user_id = :userId`,
        { replacements: { userId: authorId }, type: QueryTypes.SELECT },
      ),
    ]);

    return {
      id: user.id,
      displayName: user.display_name ?? "",
      email: user.email,
      status: user.status,
      memberSince: isoOf(user.created_on),
      anonymousOnThisItem,
      stats: {
        reports,
        rejected: rejected[0]?.n ?? 0,
        commentsRemoved,
        flagsAgainst: flagsAgainst[0]?.n ?? 0,
      },
    };
  }

  /** Every flag on the target, newest first, with who raised it (D15). */
  private async userFlags(targetType: ModerationTargetType, targetId: string): Promise<UserFlagView[]> {
    const flags = await ReportFlag.findAll({
      where: flagTargetWhere(targetType, targetId),
      order: [["created_at", "DESC"]],
      limit: FLAG_LIMIT,
    });
    const reporterIds = [...new Set(flags.map((flag) => flag.reporter_id).filter((id): id is string => Boolean(id)))];

    const [reporters, filed] = reporterIds.length
      ? await Promise.all([
          AppUser.findAll({
            where: { id: { [Op.in]: reporterIds } },
            attributes: ["id", "display_name", "created_on"],
            raw: true,
          }) as unknown as Promise<Pick<MemberRow, "id" | "display_name" | "created_on">[]>,
          sequelize.query<{ reporter_id: string; n: number }>(
            `SELECT reporter_id, CAST(COUNT(*) AS integer) AS n
               FROM report_flags WHERE reporter_id IN (:ids) GROUP BY reporter_id`,
            { replacements: { ids: reporterIds }, type: QueryTypes.SELECT },
          ),
        ])
      : [[], []];
    const reporterById = new Map(reporters.map((row) => [row.id, row]));
    const filedById = new Map(filed.map((row) => [row.reporter_id, row.n]));

    return flags.map((flag): UserFlagView => {
      const category = normaliseFlagCategory(flag.reason) ?? "other";
      const reporter = flag.reporter_id ? reporterById.get(flag.reporter_id) : undefined;
      return {
        id: flag.id,
        flagRef: flag.flag_ref,
        category,
        categoryLabel: ADMIN_TAB_LABELS[category],
        reason: flag.reason,
        note: flag.note ?? null,
        status: flag.status,
        resolution: flag.resolution ?? null,
        caseId: flag.case_id ?? null,
        contentVersion: flag.content_version ?? null,
        createdAt: flag.created_at,
        resolvedAt: flag.resolved_at ?? null,
        reporter: reporter
          ? {
              id: reporter.id,
              displayName: reporter.display_name ?? "",
              memberSince: isoOf(reporter.created_on),
              flagsFiled: filedById.get(reporter.id) ?? 0,
            }
          : null,
      };
    });
  }

  /** The most recent earlier rejection of this target, if any. */
  private async previousRejection(kase: ModerationCaseRow): Promise<PreviousRejectionView | null> {
    const earlier = await ModerationCase.findOne({
      where: {
        target_type: kase.target_type,
        target_id: kase.target_id,
        resolution: "rejected",
        id: { [Op.ne]: kase.id },
      },
      order: [["resolved_at", "DESC"]],
    });
    if (!earlier) return null;
    const refs = await loadAdminRefs([earlier.resolved_by]);
    return {
      caseId: earlier.id,
      reasonCode: earlier.resolution_reason ?? null,
      reasonLabel: rejectReasonLabel(earlier.resolution_reason),
      publicNote: earlier.resolution_note ?? null,
      internalNote: earlier.internal_note ?? null,
      resolvedAt: earlier.resolved_at ?? null,
      resolvedBy: refs.get(earlier.resolved_by ?? "") ?? null,
    };
  }

  /** Audit rows about the target, its cases and (for a report) its files, with actor names. */
  private async history(kase: ModerationCaseRow): Promise<HistoryItem[]> {
    const caseIds = (
      await ModerationCase.findAll({
        where: { target_type: kase.target_type, target_id: kase.target_id },
        attributes: ["id"],
      })
    ).map((row) => row.id);

    const scope: Record<string, unknown>[] = [
      { target_type: kase.target_type, target_id: kase.target_id },
      { case_id: { [Op.in]: caseIds.length > 0 ? caseIds : [kase.id] } },
    ];
    if (kase.target_type === "report") scope.push({ target_type: "evidence" });

    const rows = await AuditEvent.findAll({
      where: { report_id: kase.report_id, [Op.or]: scope },
      order: [["at", "DESC"]],
      limit: HISTORY_LIMIT,
    });

    const adminIds = rows.filter((row) => row.actor_kind === "admin").map((row) => row.actor_id);
    const memberIds = [
      ...new Set(
        rows
          .filter((row) => row.actor_kind === "member" && row.actor_id)
          .map((row) => row.actor_id as string),
      ),
    ];
    const [admins, members] = await Promise.all([
      loadAdminRefs(adminIds),
      memberIds.length
        ? (AppUser.findAll({
            where: { id: { [Op.in]: memberIds } },
            attributes: ["id", "display_name"],
            paranoid: false,
            raw: true,
          }) as unknown as Promise<Pick<MemberRow, "id" | "display_name">[]>)
        : Promise.resolve([] as Pick<MemberRow, "id" | "display_name">[]),
    ]);
    const memberName = new Map(members.map((row) => [row.id, row.display_name ?? ""]));

    return rows.map((row): HistoryItem => {
      let actor: HistoryItem["actor"] = null;
      if (row.actor_id && row.actor_kind === "admin") {
        const ref = admins.get(row.actor_id);
        actor = { id: row.actor_id, name: ref?.name ?? "" };
      } else if (row.actor_id && row.actor_kind === "member") {
        actor = { id: row.actor_id, name: memberName.get(row.actor_id) ?? "" };
      }
      return {
        id: row.id,
        at: row.at,
        action: row.action,
        actorKind: row.actor_kind,
        actor,
        targetType: row.target_type,
        targetId: row.target_id ?? null,
        caseId: row.case_id ?? null,
        reasonCode: row.reason_code ?? null,
        note: row.note ?? null,
        metadata: row.metadata ?? null,
      };
    });
  }
}

/**
 * The files a human approval covers: those the moderator was shown (`seen`,
 * the approve body's `evidenceIds`) that are sealed files of this report — an
 * id from another report, or of an upload still in flight, is dropped, never
 * trusted. `approveEvidence` then decides which of them change (pending →
 * approved; a thumbnail-scope approval upgraded to `full`; `full` and
 * `rejected` untouched). Review Q6: nothing is approved that was not on the
 * screen, so an empty or absent list approves nothing. Call with the report
 * row locked.
 */
async function sealedEvidenceIds(tx: Transaction, reportId: string, seen: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(seen.filter((id) => typeof id === "string" && id !== ""))];
  if (wanted.length === 0) return [];
  const rows = await ReportEvidence.findAll({
    where: { report_id: reportId, upload_state: "sealed", id: { [Op.in]: wanted } },
    attributes: ["id"],
    transaction: tx,
  });
  return rows.map((row) => row.id);
}

/**
 * After a report approval: queue an `evidence` run when sealed files are still
 * pending (review Q6) — the ones sealed after the moderator opened the case,
 * or left off `evidenceIds`. The report is `approved` now, so this is exactly
 * the late-evidence path (§5.1, `planLateEvidenceRun`): the AI assesses the
 * new photos and anything it cannot see waits in Media Review. An urgent
 * report keeps its priority and short budget (review R2). A private report is
 * never queued (D3) — its files are approved by the private sweep. Returns
 * true when a run was queued; the caller pokes the worker after the commit.
 */
async function queueLeftoverEvidenceRun(tx: Transaction, report: Report): Promise<boolean> {
  if (!needsModeration(report)) return false;
  const pending = await ReportEvidence.count({
    where: { report_id: report.id, upload_state: "sealed", moderation_state: "pending" },
    transaction: tx,
  });
  if (pending === 0) return false;
  const urgent = Boolean(report.urgent);
  await enqueueRun(tx, {
    targetType: "report",
    targetId: report.id,
    reportId: report.id,
    contentVersion: report.content_version,
    trigger: "evidence",
    priority: urgent ? RUN_PRIORITY.urgent : RUN_PRIORITY.normal,
    maxAttempts: maxAttemptsFor(urgent),
  });
  return true;
}

/** A presigned link to a sealed file — the staff projection mints both URLs. */
export async function evidenceLinkFor(row: ReportEvidence): Promise<EvidenceLink> {
  if (!evidenceService.isStorageReady) {
    throw new HttpError("File storage is not configured on this server, so files can't be opened.", 503);
  }
  const view = await evidenceService.toView(row, { audience: "staff" });
  if (!view.url) throw new HttpError("That file can't be opened right now. Try again in a moment.", 503);
  return { url: view.url, thumbUrl: view.thumbUrl };
}

/** `requestRerun`'s refusals, as the HTTP answers the console reads. */
function rerunRefusal(reason: Extract<RerunResult, { ok: false }>["reason"]): HttpError {
  switch (reason) {
    case "case_missing":
      return notFound(CASE_GONE);
    case "case_resolved":
      return conflict(ALREADY_DECIDED);
    case "target_unavailable":
      return conflict("The content this case is about has been removed.");
    case "private_target":
      return conflict("Private reports are never sent to the AI.");
    case "not_held":
      return conflict("Only content that is held for a moderator can be re-run through the AI.");
    case "not_outage":
    default:
      return conflict("This case can't be re-run right now.");
  }
}

export const moderationAdminService = new ModerationAdminService();
export default moderationAdminService;
