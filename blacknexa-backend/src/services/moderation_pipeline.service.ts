/**
 * Processing one moderation run — load, keyword stage, AI stage, policy, apply.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.3 (all six steps), §5.4 and D3, D5, D8, D9,
 * D18, D19, D21, D22. The worker (`moderation_worker.ts`) claims a run and hands
 * it here; this file turns it into a decision and writes that decision, and is
 * the only writer of a run's result.
 *
 * ── The shape of one run ──────────────────────────────────────────────────
 *   1. Load the target read-only and ask the guard (`guardRun`) whether the run
 *      may act at all: a deleted report, a removed comment, a stale content
 *      version or a target no longer in the state the trigger needs ends as a
 *      `noop`. A *private* target is never sent to the AI (D3): it is approved
 *      on the spot instead.
 *   2. Gather input: title, body (`openSealedStrict` — an unopenable body is held
 *      `content_unreadable`, never shown to the AI as ciphertext), location
 *      label, category, urgency, the author's standing; for comments the parent
 *      title; up to `MODERATION_MAX_IMAGES` sealed photos from S3 (see "What
 *      the AI sees of a photo" below); for flag re-checks only the *set* of
 *      open flag categories (D8) raised by members still active (review Q2 —
 *      a banned reporter's flags stop steering the AI), and — for a report,
 *      never a comment (review
 *      R8) — its approved photos as context.
 *   3. Keyword stage — enabled rules for the target type, plus the built-in
 *      contact-detail detectors on comments.
 *   4. AI stage — `aiEngineClient.assessModeration`. Retryable failures with
 *      attempts left throw `RetryLater` (the worker backs off); on the last
 *      attempt they become `ai_status = unavailable` and the D5 fallbacks decide.
 *      An `unavailable` answer the engine marks `retryable: false` is a
 *      permanent failure: `ai_status = error` at once, no retry, no breaker
 *      failure (review R20). Text longer than the engine accepts is sent
 *      clipped but can never be approved (`content_too_long`, review R10).
 *   5. Policy — the pure `decide()`, evaluated inside the apply transaction so
 *      the D19 resubmission check below reads the locked report.
 *   6. Apply — one transaction, `SET LOCAL lock_timeout = '5s'`, target row
 *      locked first and the case second; the guard is asked again under the
 *      lock; the run's result is written with its fencing token *before* any
 *      domain write, so a worker that lost its lease writes nothing at all.
 *      Pushes are collected and dispatched only after the transaction resolved
 *      (D18); moderator alert emails likewise.
 *
 * ── Lock order (§5.4, review R4) ──────────────────────────────────────────
 * Report run: report → case. Comment run: comment → its report (`FOR NO KEY
 * UPDATE`) → case — the order `setCommentState` and account deletion use, so a
 * report deletion (report → case) can never form a cycle with a comment apply,
 * and the guard reads the parent's `deleted_at` under the lock instead of from
 * a snapshot that a committed delete has already overtaken. `NO KEY UPDATE`,
 * not `SHARE`: two comment applies on one report would both upgrade to the
 * `comment_count` UPDATE and deadlock each other.
 *
 * ── D19 is a property of the report, not of the trigger (review R1) ───────
 * A report still owed the human check its last resubmission promised
 * (`awaitsResubmissionCheck`) is decided as a `resubmitted` run whatever the
 * run's own trigger — `evidence` (a photo committed while the resubmission
 * check was running), a reconciler run, or any trigger added later. Otherwise
 * an evidence merge could let the AI alone republish a report a human rejected.
 * The same test adds `resubmission` to a terminal hold.
 *
 * ── What the AI sees of a photo (review R5) ───────────────────────────────
 * An approval is bound to the exact bytes it covered, and the bytes are
 * verified against the hashes sealed at commit before they are sent:
 *   • a JPEG/PNG/WebP original within `AI_LIMITS.maxImageBytes` is sent itself
 *     (checked against `sha256`) and, if clean, approved at scope `full`;
 *   • otherwise the sealed preview is sent (checked against `thumb_sha256`)
 *     and approved at scope `thumbnail` — non-owners then get the preview only;
 *   • a hash mismatch, a missing hash, or a photo with neither is not sent: it
 *     waits for a moderator in Media Review, as every unassessable file does.
 * Approvals go through `evidence.service.ts#approveEvidence`, the one writer of
 * `approved_scope`; a private report's files are approved `full` (D3).
 *
 * ── Fencing (§5.2) ────────────────────────────────────────────────────────
 * The claim increments `attempts`; that value is this worker's token. Every
 * write to the run afterwards is `WHERE id = :id AND status = 'running' AND
 * attempts = :token AND started_at = :claimedAt`. If the lease expired and
 * another replica re-claimed the row, `attempts` moved on and the stale
 * worker's result is dropped silently (`FencingLost` rolls its transaction
 * back). Shutdown release keeps `attempts` and grants one extra attempt instead
 * of decrementing (see `release`), so a released row re-claimed elsewhere can
 * never be matched by the old token.
 *
 * `attempts` alone is not unique over a row's life: the enqueue upsert
 * (`moderation_enqueue.ts`, §7.2) resets a *queued* row's `attempts` to 0 when
 * an edit, flag or evidence commit merges into it, so a row that was re-claimed
 * after a lease expiry, requeued and then merged counts 1, 2, … again — and a
 * worker still running on the expired lease could match its old token. The
 * claim stamps `started_at` on every claim, so `(attempts, started_at)` is the
 * token and a stale worker never matches.
 *
 * ── What is never written anywhere ────────────────────────────────────────
 * Member content in logs, run errors or audit rows. Run rows hold ids, codes and
 * the AI's verdict metadata (its evidence quotes are content, and are deleted
 * with the report by the nightly purge, §7.8). Errors are `ai:<type>_<status>`
 * or `system:<ErrorName>` — enough to diagnose, nothing to leak.
 */

import { createHash } from "crypto";
import { Op, QueryTypes, UniqueConstraintError, type InferAttributes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger, { runBackground } from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report, ReportEvidence } from "@/models/report.model";
import { ReportComment, ReportFlag } from "@/models/report_social.model";
import { AppUser } from "@/models/app_user.model";
import { AdminUser } from "@/models/admin_user.model";
import type { ModerationCaseRow, ModerationRun } from "@/models/moderation.model";
import { aiEngineClient } from "@/services/ai_engine.client";
import { encryptionService } from "@/services/encryption.service";
import { approveEvidence, awaitsResubmissionCheck } from "@/services/evidence.service";
import { s3Service } from "@/services/s3.service";
import { mailerService, type ModerationAlertReason } from "@/services/mailer.service";
import { notificationService, type PendingPush } from "@/services/notification.service";
import { auditService } from "@/services/audit.service";
import { moderationCaseService } from "@/services/moderation_case.service";
import { enqueueRun, maxAttemptsFor } from "@/services/moderation_enqueue";
import { setCommentState } from "@/services/comment_state";
import { keywordRulesService } from "@/services/keyword_rules.service";
import { detectContactDetails, matchKeywords } from "@/services/moderation_keyword_matcher";
import {
  AI_ERROR_PREFIX,
  SYSTEM_ERROR_PREFIX,
  decide,
  flaggedCategoriesFor,
  guardRun,
  isOutageOnlyCase,
  terminalHoldReason,
  type CancelReason,
  type GuardInput,
  type PolicyAi,
  type PolicyDecision,
  type PolicyInput,
  type PolicyMode,
} from "@/services/moderation_policy";
import type { CircuitBreaker } from "@/services/moderation_breaker";
import { sniffMediaType } from "@/utils/binary.util";
import {
  AI_LIMITS,
  OWNER_NOTIFICATIONS,
  RUN_PRIORITY,
  needsModeration,
  type AiAssessImage,
  type AiAssessRequest,
  type AiImageMimeType,
  type AiKeywordSignal,
  type AiReportCategory,
  type AuditAction,
  type EvidenceApprovedScope,
  type HoldReason,
  type KeywordHit,
  type OwnerNotificationCopy,
  type PolicyCategory,
  type RunOutcome,
  type RunTrigger,
} from "@/types/moderation.interface";

/** A claimed `moderation_runs` row as the claim's `RETURNING *` gives it. */
export type ClaimedRun = InferAttributes<ModerationRun>;

/** What a processed run came to — for the worker's log line. */
export interface RunSummary {
  runId: string;
  outcome: RunOutcome;
  mode: PolicyMode | null;
  /** The cancel reason for a `noop`, or the terminal hold reason. */
  reason?: string;
}

/** What the worker lends a run: its abort signal and the replica's breaker. */
export interface PipelineContext {
  /** Aborted when the worker shuts down; the worker then releases the row. */
  signal: AbortSignal;
  breaker: CircuitBreaker;
}

/**
 * "Not now" — the worker reschedules the run with backoff. `consumeAttempt`
 * is false when the engine was never called (the breaker was open), and
 * `notBefore` is then when the breaker reopens.
 */
export class RetryLater extends Error {
  constructor(
    readonly errorCode: string,
    readonly consumeAttempt: boolean = true,
    readonly notBefore: number | null = null,
  ) {
    super(errorCode);
    this.name = "RetryLater";
  }
}

/** This worker's lease was lost; its result must be dropped silently. */
export class FencingLost extends Error {
  constructor() {
    super("moderation run fencing token no longer matches");
    this.name = "FencingLost";
  }
}

/** The worker is shutting down; the row is released by `stop()`, not rescheduled. */
export class ShutdownAbort extends Error {
  constructor() {
    super("moderation worker shutting down");
    this.name = "ShutdownAbort";
  }
}

/** A photo fetch that takes longer than this is treated as unassessable. */
const THUMB_FETCH_TIMEOUT_MS = 10_000;

/** Image formats the engine accepts (§6.1). */
const ENGINE_IMAGE_TYPES: readonly AiImageMimeType[] = ["image/jpeg", "image/png", "image/webp"];

interface Snapshot {
  report: Report | null;
  comment: ReportComment | null;
  pendingEvidenceCount: number;
  caseOpen: boolean;
}

/** Which sealed object of a photo is sent to the AI, and what approving it covers (R5). */
export interface PhotoSource {
  /** The sealed S3 key sent — `storage_key` or `thumb_key`. */
  key: string;
  /** The SHA-256 sealed at commit for exactly that object. */
  sha256: string;
  /** `full` when the original itself is assessed, `thumbnail` for the preview. */
  scope: EvidenceApprovedScope;
}

/** The `report_evidence` columns `photoSourceFor` reads. */
export interface PhotoSourceRow {
  kind: string;
  mime: string | null;
  bytes: number | null;
  storage_key: string | null;
  sha256: string | null;
  thumb_key: string | null;
  thumb_sha256: string | null;
}

interface PhotoCandidate extends PhotoSource {
  id: string;
  /** Pending files are decided by this run; approved ones are context only. */
  pending: boolean;
}

interface FinishFields {
  status: "done" | "cancelled";
  outcome: RunOutcome;
  reasons: HoldReason[] | null;
  ai?: PolicyAi | null;
  aiDurationMs?: number | null;
  hits?: readonly KeywordHit[] | null;
  imagesAssessed?: number | null;
  error: string | null;
}

interface PendingAlert {
  caseId: string;
  reportRef: string;
  reason: ModerationAlertReason;
}

/**
 * Everything the apply step needs from stages 2–4. The decision itself is taken
 * in the apply transaction (`decide(policy)` with the D19 trigger read under
 * the report lock, review R1), so the plan carries the policy's input.
 */
interface ApplyPlan {
  mode: PolicyMode;
  policy: PolicyInput;
  hits: KeywordHit[];
  ai: PolicyAi;
  aiError: string | null;
  aiDurationMs: number | null;
  /** The approval scope of each pending photo that was sent to the AI (R5). */
  photoScopes: ReadonlyMap<string, EvidenceApprovedScope>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Truncate by code point, so a surrogate pair is never split. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return Array.from(text).slice(0, max).join("");
}

function clipOrNull(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed ? clip(trimmed, max) : null;
}

/** §5.4: a lock wait becomes an error (→ retry) after five seconds, never a hang. */
export async function setLockTimeout(tx: Transaction): Promise<void> {
  await sequelize.query("SET LOCAL lock_timeout = '5s'", { transaction: tx });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** `ai:<type>[_<status>]` — the run's `error` for an engine failure. */
function aiErrorCode(errorType: string, status: number | null): string {
  return `${AI_ERROR_PREFIX}${errorType}${status ? `_${status}` : ""}`;
}

/** The owner-facing deep link for a report. */
function reportLink(report: Report): string {
  return `/r/${report.case_ref}`;
}

/**
 * A hold the author has already been told about: a re-run (`manual`, or a
 * `resubmitted` one — see `requestRerun`) of a case that is still open. The
 * "Your report is with a moderator" notice went out when the case opened.
 */
function isQuietRerun(trigger: RunTrigger, openCase: ModerationCaseRow | null): boolean {
  return Boolean(openCase) && (trigger === "manual" || trigger === "resubmitted");
}

/** The hold reasons a run and its case record: the policy's plus media review. */
function recordedReasons(decision: PolicyDecision): HoldReason[] {
  const reasons = [...decision.holdReasons];
  if (decision.media.mediaReview && !reasons.includes("media_unassessed")) reasons.push("media_unassessed");
  return reasons;
}

/** Longer than `max` code points — the unit `clip` cuts in and the engine's `max_length` counts. */
function longerThan(text: string | null | undefined, max: number): boolean {
  if (!text || text.length <= max) return false; // UTF-16 length ≥ code points
  return Array.from(text).length > max;
}

/**
 * Review R10: would any field the AI is shown *as the content being judged* be
 * clipped by `buildRequest`? Then approving would publish words the AI never
 * read: the body can grow past its 20,000-character cap when the scrubber
 * replaces short emails with the longer `[EMAIL]`, and a report's title or
 * area label past theirs the same way. A comment's parent title is context,
 * not content, and is not counted. Mirrors `buildRequest`: title and label
 * are trimmed before they are clipped, the body is not.
 */
export function exceedsEngineLimits(input: {
  targetType: "report" | "comment";
  title: string | null | undefined;
  body: string | null | undefined;
  locationLabel: string | null | undefined;
}): boolean {
  if (longerThan(input.body, AI_LIMITS.maxBodyChars)) return true;
  if (input.targetType === "comment") return false;
  return (
    longerThan(input.title?.trim(), AI_LIMITS.maxTitleChars) ||
    longerThan(input.locationLabel?.trim(), AI_LIMITS.maxLocationLabelChars)
  );
}

/**
 * The texts D8's verbatim check searches — every field the AI was shown as
 * content. For a report that includes the location label (review R17): the
 * keyword stage matches it and the engine receives it inside the content
 * boundary, so a quote from it is a quote from the content.
 */
export function verbatimHaystack(
  targetType: "report" | "comment",
  report: { title: string; location_label?: string | null },
  text: string | null,
): string[] {
  return targetType === "comment"
    ? [text ?? ""]
    : [report.title, text ?? "", report.location_label ?? ""];
}

/**
 * Review R5: which sealed object of a photo the AI is sent. The original when
 * the engine can read it as is (JPEG/PNG/WebP within `AI_LIMITS.maxImageBytes`
 * — `bytes` is the size measured at commit, not a client claim) and its hash
 * is on record; else the sealed preview when *its* hash is on record (sealed
 * after review R5); else nothing — the file waits for a moderator. An approval
 * then covers exactly the object assessed: `full` or `thumbnail`.
 */
export function photoSourceFor(row: PhotoSourceRow): PhotoSource | null {
  if (row.kind !== "photo") return null;
  const mime = (row.mime ?? "").toLowerCase();
  const bytes = Number(row.bytes ?? 0);
  if (
    row.storage_key &&
    row.sha256 &&
    (ENGINE_IMAGE_TYPES as readonly string[]).includes(mime) &&
    bytes > 0 &&
    bytes <= AI_LIMITS.maxImageBytes
  ) {
    return { key: row.storage_key, sha256: row.sha256, scope: "full" };
  }
  if (row.thumb_key && row.thumb_sha256) {
    return { key: row.thumb_key, sha256: row.thumb_sha256, scope: "thumbnail" };
  }
  return null;
}

/**
 * Review R5: the downloaded bytes as an engine image, or null when they are
 * not what was sealed (hash mismatch — they were replaced, or the row is
 * wrong), empty, over the engine's size cap, or not a JPEG/PNG/WebP by their
 * magic bytes. The AI is never shown bytes the approval would not cover.
 */
export function verifiedEngineImage(bytes: Buffer, expectedSha256: string): AiAssessImage | null {
  if (bytes.length === 0 || bytes.length > AI_LIMITS.maxImageBytes) return null;
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256.trim().toLowerCase()) return null;
  const mime = sniffMediaType(bytes);
  if (!mime || !(ENGINE_IMAGE_TYPES as readonly string[]).includes(mime)) return null;
  return { mimeType: mime as AiImageMimeType, data: bytes.toString("base64") };
}

/** `ai:unavailable[_<reason>]` — the run's `error` for an `unavailable` answer (R20). */
function unavailableErrorCode(reason: string | null): string {
  return `${AI_ERROR_PREFIX}unavailable${reason ? `_${reason}` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared writes — also used by the reconciler
// ─────────────────────────────────────────────────────────────────────────────

/** Write an owner notification in `tx`; its push is dispatched after the commit. */
async function notifyOwner(
  tx: Transaction,
  report: Report,
  copy: OwnerNotificationCopy,
  pendingPushes: PendingPush[],
): Promise<void> {
  if (!report.user_id) return; // a severed report has no author left to tell
  await notificationService.createInTx(
    tx,
    {
      userId: report.user_id,
      type: copy.type,
      title: copy.title,
      body: copy.body ?? undefined,
      link: reportLink(report),
      reportId: report.id,
    },
    pendingPushes,
  );
}

/**
 * Approve a comment (§5.3 step 6, §7.5): `setCommentState` keeps the counter
 * exact, and the report owner hears "Someone replied to your report" now — at
 * approval, not at creation (D18) — with the first 160 characters of the
 * *approved* text. Once per comment (`reply_notified`), and never to the owner
 * about their own comment. Lock the comment row before calling.
 */
export async function approveComment(
  tx: Transaction,
  report: Report,
  comment: ReportComment,
  pendingPushes: PendingPush[],
): Promise<void> {
  await setCommentState(tx, comment.id, { moderationState: "approved", moderationReason: null });
  if (comment.reply_notified) return;
  if (report.user_id && report.user_id !== comment.user_id) {
    await notificationService.createInTx(
      tx,
      {
        userId: report.user_id,
        type: OWNER_NOTIFICATIONS.reply.type,
        title: OWNER_NOTIFICATIONS.reply.title,
        body: comment.body.slice(0, 160),
        link: `${reportLink(report)}/comments`,
        reportId: report.id,
      },
      pendingPushes,
    );
  }
  await ReportComment.update({ reply_notified: true }, { where: { id: comment.id }, transaction: tx });
}

/**
 * Approve the files a decision released, each at the scope of what the AI
 * assessed (review R5): `thumbnail` for a photo judged on its sealed preview,
 * `full` for one judged on its original. A file approved without being sent
 * at all can only come from `MODERATION_UNASSESSED_MEDIA=publish` — the
 * operator's explicit choice to publish unassessed files — and is `full`.
 * Returns how many rows changed.
 */
async function approveDecidedMedia(
  tx: Transaction,
  reportId: string,
  ids: readonly string[],
  scopes: ReadonlyMap<string, EvidenceApprovedScope>,
): Promise<number> {
  const byScope: Record<EvidenceApprovedScope, string[]> = { full: [], thumbnail: [] };
  for (const id of ids) byScope[scopes.get(id) ?? "full"].push(id);
  let changed = 0;
  for (const scope of ["thumbnail", "full"] as const) {
    if (byScope[scope].length === 0) continue;
    changed += (await approveEvidence(tx, { reportId, ids: byScope[scope], scope })).length;
  }
  return changed;
}

/**
 * D3: private content is approved without ever reaching the AI. Used when a run
 * finds its target private and by the reconciler's private sweep. The report
 * (or comment) row must already be locked. A private report's pending evidence
 * is approved with it, at scope `full` — nobody but its owner and staff can
 * see it (review R5: every approval names its scope). Returns true when
 * anything changed.
 */
export async function approvePrivateContent(
  tx: Transaction,
  report: Report,
  comment: ReportComment | null,
  pendingPushes: PendingPush[],
): Promise<boolean> {
  let changed = false;
  if (comment) {
    if (comment.moderation_state === "pending" && comment.status === "visible") {
      await approveComment(tx, report, comment, pendingPushes);
      changed = true;
    }
    return changed;
  }
  if (report.moderation_state === "pending") {
    await report.update(
      {
        moderation_state: "approved",
        moderated_at: nowIso(),
        approved_content_version: report.content_version,
        published_at: report.published_at ?? report.filed_at,
      },
      { transaction: tx },
    );
    changed = true;
  }
  const evidence = await approveEvidence(tx, { reportId: report.id, ids: "all_pending", scope: "full" });
  return changed || evidence.length > 0;
}

/**
 * Email every active moderator and superadmin, plus `MODERATION_ALERT_EMAILS`,
 * that an urgent or safety-risk item is waiting (D21). Runs after the commit,
 * detached; the email carries a reference and a console link, never content.
 */
async function sendModerationAlert(alert: PendingAlert): Promise<void> {
  const staff = await AdminUser.findAll({
    where: { is_active: true, role: { [Op.in]: ["moderator", "superadmin"] } },
    attributes: ["email"],
  });
  const recipients = [...staff.map((row) => row.email), ...env.moderation.alertEmails];
  const consoleUrl = `${env.adminConsoleUrl.replace(/\/+$/, "")}/moderation/${alert.caseId}`;
  const delivered = await mailerService.sendModerationAlert(recipients, {
    reportRef: alert.reportRef,
    reason: alert.reason,
    consoleUrl,
  });
  logger.info("[moderation] alert email sent", {
    caseId: alert.caseId,
    reason: alert.reason,
    recipients: new Set(recipients.map((r) => r.toLowerCase())).size,
    delivered,
  });
}

/** Dispatch what a committed transaction owes: pushes, then alert emails. */
export function dispatchAfterCommit(pendingPushes: PendingPush[], alerts: readonly PendingAlert[] = []): void {
  notificationService.dispatchPushes(pendingPushes);
  for (const alert of alerts) runBackground(sendModerationAlert(alert), "[moderation] alert email");
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-run — §5.1 "moderator Re-run AI, or reconciler after an AI outage"
// ─────────────────────────────────────────────────────────────────────────────

export interface RerunInput {
  caseId: string;
  /** `admin` for *Re-run AI* (§8.1), `system` for the reconciler (D5). */
  actor: { kind: "admin" | "system"; id: string | null; ip?: string | null };
  /** Skip a target another transaction is holding instead of waiting (reconciler). */
  skipLocked?: boolean;
  /** Only re-run a case whose holds an outage left behind (reconciler, §5.2). */
  requireOutageOnly?: boolean;
}

export type RerunResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      reason: "case_missing" | "case_resolved" | "target_unavailable" | "not_held" | "private_target" | "not_outage";
    };

/**
 * The trigger a report run is *decided* as (D19, review R1). A report still
 * owed the human check its last resubmission promised is decided as
 * `resubmitted` whatever trigger queued the run — an `evidence` run (a photo
 * committed while the resubmission check was already running), a reconciler
 * run, or any trigger added later — so no path can let the AI alone
 * republish a report a human rejected. `awaitsResubmissionCheck` is the one
 * query the edit, late-evidence and re-run paths share. Call with the report
 * row locked.
 */
async function decisionTrigger(tx: Transaction, run: ClaimedRun, report: Report): Promise<RunTrigger> {
  if (run.target_type !== "report" || run.trigger === "resubmitted") return run.trigger;
  return (await awaitsResubmissionCheck(tx, report)) ? "resubmitted" : run.trigger;
}

/**
 * Held → pending, plus a queued `manual` run (priority 50, or 100 when urgent),
 * in the caller's transaction — the one implementation behind the moderator's
 * *Re-run AI* and the reconciler's outage recovery. Lock order: the target row
 * first, then the case, re-checked under the locks. The case stays open; the
 * run's result clears it (approve, no user flags) or merges into it (hold), and
 * the author is not notified again (the run sees an open case on a `manual`
 * trigger). Private targets are never re-run (D3). The caller rings
 * `pokeModeration()` after the transaction commits.
 *
 * A report still awaiting its resubmission check (D19) is re-run as
 * `resubmitted` instead of `manual`: the AI runs again, so the moderator sees
 * its fresh view, but the outcome is always a hold for a human.
 */
export async function requestRerun(tx: Transaction, input: RerunInput): Promise<RerunResult> {
  const peek = await moderationCaseService.findById(tx, input.caseId);
  if (!peek) return { ok: false, reason: "case_missing" };
  if (peek.state !== "open") return { ok: false, reason: "case_resolved" };

  const lock = { transaction: tx, lock: tx.LOCK.UPDATE, ...(input.skipLocked ? { skipLocked: true } : {}) };
  let before: string;
  let contentVersion = 1;
  let urgent = false;
  let report: Report | null;
  let comment: ReportComment | null = null;

  if (peek.target_type === "comment") {
    comment = await ReportComment.findOne({ where: { id: peek.target_id }, ...lock });
    if (!comment || comment.status !== "visible") return { ok: false, reason: "target_unavailable" };
    // Comment → report → case, the apply's order (review R4): `deleted_at` is
    // read under the lock, and a report deletion cannot interleave with it.
    report = await Report.findOne({
      where: { id: comment.report_id },
      ...lock,
      lock: tx.LOCK.NO_KEY_UPDATE,
    });
    if (!report || report.deleted_at) return { ok: false, reason: "target_unavailable" };
    // Review Q8: nothing on a deactivated report is re-run — the run would be
    // dropped by the guard anyway, leaving the comment pending for nothing.
    if (report.moderation_state === "deactivated") return { ok: false, reason: "target_unavailable" };
    if (!needsModeration(report)) return { ok: false, reason: "private_target" };
    if (comment.moderation_state !== "held") return { ok: false, reason: "not_held" };
    before = comment.moderation_state;
  } else {
    report = await Report.findOne({ where: { id: peek.target_id }, ...lock });
    if (!report || report.deleted_at) return { ok: false, reason: "target_unavailable" };
    if (!needsModeration(report)) return { ok: false, reason: "private_target" };
    if (report.moderation_state !== "held") return { ok: false, reason: "not_held" };
    before = report.moderation_state;
    contentVersion = report.content_version;
    urgent = Boolean(report.urgent);
  }

  const kase = await moderationCaseService.findById(tx, input.caseId, { lock: true });
  if (!kase || kase.state !== "open") return { ok: false, reason: "case_resolved" };
  if (input.requireOutageOnly && !isOutageOnlyCase(kase.hold_reasons ?? [], kase.user_flag_count)) {
    return { ok: false, reason: "not_outage" };
  }

  const trigger: RunTrigger =
    !comment && (await awaitsResubmissionCheck(tx, report)) ? "resubmitted" : "manual";

  if (comment) {
    await setCommentState(tx, comment.id, { moderationState: "pending" });
  } else {
    await report.update({ moderation_state: "pending" }, { transaction: tx });
  }

  const runId = await enqueueRun(tx, {
    targetType: kase.target_type,
    targetId: kase.target_id,
    reportId: kase.report_id,
    commentId: kase.comment_id ?? null,
    contentVersion,
    trigger,
    priority: urgent ? RUN_PRIORITY.urgent : RUN_PRIORITY.manual,
    maxAttempts: maxAttemptsFor(urgent),
  });

  await auditService.record(tx, {
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    action: "moderation.rerun",
    targetType: kase.target_type,
    targetId: kase.target_id,
    reportId: kase.report_id,
    caseId: kase.id,
    reasonCode: input.requireOutageOnly ? "ai_unavailable" : null,
    metadata: {
      runId,
      trigger,
      reason: input.actor.kind === "system" ? "outage_recovery" : "moderator_rerun",
      before: { moderationState: before },
      after: { moderationState: "pending" },
    },
    ip: input.actor.ip ?? null,
  });
  return { ok: true, runId };
}

/**
 * The alert a case change owes, if any — once per case (§5.3 step 6): a safety
 * risk the case did not already carry, or an urgent report's case being opened.
 */
function alertFor(
  before: ModerationCaseRow | null,
  after: ModerationCaseRow,
  report: Report,
  targetIsReport: boolean,
): PendingAlert | null {
  const reportRef = targetIsReport ? report.case_ref : `${report.case_ref} (comment)`;
  const hadSafety = Boolean(before && before.id === after.id && before.safety_risk && before.safety_risk !== "none");
  const hasSafety = Boolean(after.safety_risk && after.safety_risk !== "none");
  if (hasSafety && !hadSafety) return { caseId: after.id, reportRef, reason: "safety" };
  const opened = !before || before.id !== after.id;
  if (opened && targetIsReport && report.urgent) return { caseId: after.id, reportRef, reason: "urgent" };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline
// ─────────────────────────────────────────────────────────────────────────────

class ModerationPipeline {
  /**
   * Process one claimed run to a decision. Throws `RetryLater`, `FencingLost`
   * or `ShutdownAbort` for the worker to handle; any other throw is the
   * worker's catch-all (retry with backoff, terminal when exhausted).
   */
  async process(run: ClaimedRun, ctx: PipelineContext): Promise<RunSummary> {
    // §5.2: an exhausted row skips every stage.
    if (run.attempts > run.max_attempts) return this.terminal(run, ctx);

    // 1. Load and guard (read-only).
    const snapshot = await this.loadSnapshot(run, null);
    const guard = guardRun(this.guardInput(run, snapshot));
    if (!guard.ok) return this.finishWithoutDecision(run, guard.reason, ctx);
    const mode = guard.mode;
    const report = snapshot.report as Report;
    const comment = snapshot.comment;
    const isComment = run.target_type === "comment";

    // 2. Input.
    const authorId = isComment ? comment?.user_id ?? null : report.user_id ?? null;
    const authorActive = await this.authorActive(authorId);

    let body: string | null;
    if (isComment) {
      body = comment?.body ?? null;
    } else {
      body = report.body_encrypted ? await encryptionService.openSealedStrict(report.body) : report.body;
    }
    const contentReadable = typeof body === "string" && body.trim().length > 0;
    const text = contentReadable ? (body as string) : null;
    // Review R10: part of this would be clipped out of the AI's view.
    const contentTruncated =
      contentReadable &&
      exceedsEngineLimits({
        targetType: run.target_type,
        title: isComment ? null : report.title,
        body: text,
        locationLabel: isComment ? null : report.location_label,
      });

    const { candidates, unassessableIds } = isComment
      ? { candidates: [] as PhotoCandidate[], unassessableIds: [] as string[] }
      : await this.pendingMedia(report.id);
    // Context photos only for a report's own flag re-check (review R8): a
    // comment is judged on its words, and the engine frames every attached
    // photo as part of the content — the parent report's pictures must not be
    // what hides someone's comment.
    const contextPhotos =
      mode === "flag" && !isComment
        ? await this.approvedPhotos(report.id, env.moderation.maxImages - candidates.length)
        : [];

    const flaggedCategories = mode === "flag" ? await this.openFlagCategories(run) : [];

    // 3. Keyword stage.
    const rules = await keywordRulesService.rulesFor(run.target_type);
    const hits = matchKeywords(
      isComment
        ? { body: text }
        : { title: report.title, body: text, locationLabel: report.location_label },
      rules,
    );
    if (isComment && text) hits.push(...detectContactDetails(text, "body"));

    // 4. AI stage.
    const wantsAi = contentReadable && !(mode === "evidence" && candidates.length === 0);
    const aiReachable = env.moderation.enabled && aiEngineClient.isConfigured;
    if (wantsAi && aiReachable && ctx.breaker.isOpen()) {
      throw new RetryLater(`${AI_ERROR_PREFIX}circuit_open`, false, ctx.breaker.openUntil);
    }

    let photoIds = candidates.map((photo) => photo.id);
    let images: AiAssessImage[] = [];
    // What approving each photo sent to the AI covers (R5). A file approved
    // without being sent is unassessed media (see `approveDecidedMedia`).
    const photoScopes = new Map<string, EvidenceApprovedScope>();
    let callAi = wantsAi && aiReachable;
    if (callAi && (candidates.length > 0 || contextPhotos.length > 0)) {
      const fetched = await this.fetchPhotos([...candidates, ...contextPhotos], ctx);
      // Pending photos first, so `imagesAssessed` (counted from the front)
      // covers the files this run decides before any context photo.
      const sentPending = fetched.sent.filter((photo) => photo.pending);
      const sentContext = fetched.sent.filter((photo) => !photo.pending);
      photoIds = sentPending.map((photo) => photo.id);
      for (const photo of sentPending) photoScopes.set(photo.id, photo.scope);
      unassessableIds.push(...fetched.failedPendingIds);
      images = [...sentPending, ...sentContext].map((photo) => photo.image);
      // An evidence run exists for the new photos; the text is already
      // approved. If none of them could be fetched there is nothing to ask.
      if (mode === "evidence" && sentPending.length === 0) callAi = false;
    }

    let ai: PolicyAi = { status: "skipped", assessment: null };
    let aiError: string | null = null;
    let aiDurationMs: number | null = null;
    if (callAi) {
      const request = this.buildRequest(run, report, text as string, hits, flaggedCategories, images);
      const started = Date.now();
      const result = await aiEngineClient.assessModeration(request, { signal: ctx.signal });
      aiDurationMs = Date.now() - started;
      if (ctx.signal.aborted) throw new ShutdownAbort();

      if (result.ok && result.data.status !== "unavailable") {
        ctx.breaker.recordSuccess();
        ai = { status: result.data.status, assessment: result.data };
      } else if (result.ok && !result.data.retryable) {
        // Review R20: the engine answered, and says this request will fail the
        // same way every time (a provider 4xx, a RECITATION finish, invalid
        // JSON despite the schema, Gemini unconfigured…). A permanent failure,
        // not an outage: no retry, no breaker failure, and `ai_status = error`
        // so the reconciler leaves it to a moderator's *Re-run AI*. The body is
        // kept — its prescreen `injectionSuspected` still counts (R9).
        ai = { status: "error", assessment: result.data };
        aiError = unavailableErrorCode(result.data.unavailableReason);
      } else if (!result.ok && !result.retryable) {
        // A permanent 4xx: retrying will not help, and it is not an outage.
        ai = { status: result.errorType === "unconfigured" ? "skipped" : "error", assessment: null };
        aiError = aiErrorCode(result.errorType, result.status);
      } else {
        // Retryable. An engine that predates `retryable` lands here too.
        const code = result.ok
          ? unavailableErrorCode(result.data.unavailableReason)
          : aiErrorCode(result.errorType, result.status);
        ctx.breaker.recordFailure();
        if (run.attempts < run.max_attempts) throw new RetryLater(code);
        // Last attempt: the D5 fallbacks decide.
        ai = { status: "unavailable", assessment: result.ok ? result.data : null };
        aiError = code;
      }
    }

    // 5. Policy input. `decide()` itself runs in the apply transaction, where
    // the D19 trigger is read under the report lock (review R1).
    const flagFacts =
      mode === "flag"
        ? await this.flagFacts(run, report)
        : { humanCleared: false, autoHidden: false };
    const policy: PolicyInput = {
      mode,
      trigger: run.trigger,
      targetType: run.target_type,
      authorActive,
      contentReadable,
      contentTruncated,
      keywordHits: hits,
      ai,
      media: { photoIds, unassessableIds },
      contentTexts: verbatimHaystack(run.target_type, report, text),
      humanClearedCurrentVersion: flagFacts.humanCleared,
      autoHiddenCurrentVersion: flagFacts.autoHidden,
      thresholds: {
        autoApproveMinConfidence: env.moderation.autoApproveMinConfidence,
        violationMinConfidence: env.moderation.violationMinConfidence,
        flagAutohideMinConfidence: env.moderation.flagAutohideMinConfidence,
      },
      fallbacks: {
        reportAiFallback: env.moderation.reportAiFallback,
        commentAiFallback: env.moderation.commentAiFallback,
        unassessedMedia: env.moderation.unassessedMedia,
      },
    };

    // 6. Apply.
    return this.apply(run, { mode, policy, hits, ai, aiError, aiDurationMs, photoScopes }, ctx);
  }

  // ── Stage 6: apply ─────────────────────────────────────────────────────

  private async apply(run: ClaimedRun, plan: ApplyPlan, ctx: PipelineContext): Promise<RunSummary> {
    const token = run.attempts;
    const pendingPushes: PendingPush[] = [];
    const alerts: PendingAlert[] = [];
    const isComment = run.target_type === "comment";

    const summary = await sequelize.transaction(async (tx): Promise<RunSummary> => {
      await setLockTimeout(tx);
      // Target row first (inside loadSnapshot), then the case.
      const snapshot = await this.loadSnapshot(run, tx);
      const guard = guardRun(this.guardInput(run, snapshot));
      if (!guard.ok || guard.mode !== plan.mode) {
        const reason: CancelReason = guard.ok ? "state_changed" : guard.reason;
        if (reason === "private_target" && snapshot.report) {
          await this.approvePrivateInTx(tx, run, token, snapshot, pendingPushes);
        } else {
          await this.cancelInTx(tx, run, token, reason);
        }
        return { runId: run.id, outcome: "noop", mode: null, reason };
      }

      const report = snapshot.report as Report;
      const comment = snapshot.comment;
      const openCase = await moderationCaseService.findOpenCase(tx, run.target_type, run.target_id, {
        lock: true,
      });
      if (ctx.signal.aborted) throw new ShutdownAbort();

      // Review R1: decided as `resubmitted` whenever the locked report is still
      // owed its resubmission check, whatever trigger queued this run.
      const trigger = plan.mode === "content" ? await decisionTrigger(tx, run, report) : run.trigger;
      const decision = decide({ ...plan.policy, trigger });
      const reasons = recordedReasons(decision);
      const finished = await this.fencedFinish(tx, run, token, {
        status: "done",
        outcome: decision.outcome,
        reasons: reasons.length > 0 ? reasons : null,
        ai: plan.ai,
        aiDurationMs: plan.aiDurationMs,
        hits: plan.hits,
        imagesAssessed:
          plan.ai.status === "assessed" && plan.ai.assessment ? plan.ai.assessment.imagesAssessed : 0,
        error: plan.aiError,
      });
      if (!finished) throw new FencingLost();

      const now = nowIso();
      const urgent = !isComment && Boolean(report.urgent);
      const beforeState = isComment ? comment?.moderation_state ?? null : report.moderation_state;
      let afterState = beforeState;
      let caseRow: ModerationCaseRow | null = openCase;
      let action: AuditAction;
      let firstPublish = false;
      let evidenceApproved = 0;

      const upsertCase = async (mediaReview: boolean): Promise<ModerationCaseRow> =>
        moderationCaseService.upsertOpenCase(tx, {
          targetType: run.target_type,
          targetId: run.target_id,
          reportId: run.report_id,
          commentId: run.comment_id ?? null,
          aiFlagged: decision.aiFlagged,
          keywordFlagged: decision.keywordFlagged,
          mediaReview,
          categories: decision.categories,
          holdReasons: reasons,
          safetyRisk: decision.safetyRisk,
          urgent,
          latestRunId: run.id,
          highSeverityViolation: decision.highSeverityViolation,
        });

      const holdTarget = async (): Promise<void> => {
        if (isComment && comment) {
          await setCommentState(tx, comment.id, { moderationState: "held" });
        } else {
          await report.update({ moderation_state: "held", moderated_at: now }, { transaction: tx });
        }
        afterState = "held";
      };

      const tellOwnerHeld = async (): Promise<void> => {
        // Comments have no "held" notice (the author sees "Checking…" become
        // "Held for review" in the thread). A moderator's or the reconciler's
        // re-run of a case the author already heard about stays quiet — a
        // re-run of a resubmission keeps its `resubmitted` trigger (D19).
        if (isComment) return;
        if (isQuietRerun(trigger, openCase)) return;
        const copy = decision.safetyRisk ? OWNER_NOTIFICATIONS.withModeratorSafety : OWNER_NOTIFICATIONS.withModerator;
        await notifyOwner(tx, report, copy, pendingPushes);
      };

      if (decision.mode === "content" && decision.outcome === "approve") {
        action = "moderation.auto_approve";
        if (isComment && comment) {
          await approveComment(tx, report, comment, pendingPushes);
        } else {
          firstPublish = !report.published_at;
          await report.update(
            {
              moderation_state: "approved",
              moderated_at: now,
              approved_content_version: report.content_version,
              published_at: report.published_at ?? now,
            },
            { transaction: tx },
          );
          if (firstPublish) await notifyOwner(tx, report, OWNER_NOTIFICATIONS.live, pendingPushes);
        }
        afterState = "approved";
        evidenceApproved = await approveDecidedMedia(tx, report.id, decision.media.approveIds, plan.photoScopes);

        // An open case with no user flags was only waiting on this content: it
        // is cleared. User flags keep a case open for a human (D8). Files the
        // AI could not see get a fresh, media-only case.
        if (openCase && openCase.user_flag_count === 0) {
          caseRow = await moderationCaseService.resolveCase(tx, openCase.id, {
            resolution: "auto_cleared",
            resolvedBy: null,
          });
        }
        if (decision.media.mediaReview) {
          caseRow = await moderationCaseService.upsertOpenCase(tx, {
            targetType: run.target_type,
            targetId: run.target_id,
            reportId: run.report_id,
            commentId: run.comment_id ?? null,
            mediaReview: true,
            holdReasons: ["media_unassessed"],
            urgent,
            latestRunId: run.id,
            highSeverityViolation: false,
          });
        }
      } else if (decision.mode === "content") {
        action = "moderation.hold";
        await holdTarget();
        caseRow = await upsertCase(decision.media.mediaReview);
        const alert = alertFor(openCase, caseRow, report, !isComment);
        if (alert) alerts.push(alert);
        await tellOwnerHeld();
      } else if (decision.mode === "evidence") {
        // The report's own state is never changed by an evidence run.
        action = decision.outcome === "approve" ? "moderation.auto_approve" : "moderation.hold";
        evidenceApproved = await approveDecidedMedia(tx, report.id, decision.media.approveIds, plan.photoScopes);
        // Review R13: the reconciler re-ran photos an outage held, and this
        // time the AI answered. The outage case is cleared *first* — the
        // evidence-mode twin of the content approve above — and files the AI
        // can never see then get a fresh, media-only case. Merging into the
        // outage case instead would keep `ai_unavailable` in its (unioned)
        // hold reasons: the case would stay outage-only, and reconciler step 3
        // would re-queue an evidence run for the unseeable files every ten
        // minutes, forever. An outage-only case on an approved report can only
        // be that hold (a content outage holds the report itself).
        const outageCleared =
          decision.outcome === "approve" &&
          openCase !== null &&
          isOutageOnlyCase(openCase.hold_reasons ?? [], openCase.user_flag_count);
        if (outageCleared && openCase) {
          caseRow = await moderationCaseService.resolveCase(tx, openCase.id, {
            resolution: "auto_cleared",
            resolvedBy: null,
          });
        }
        if (decision.outcome === "hold" || decision.media.mediaReview) {
          caseRow = await upsertCase(true);
          const alert = alertFor(outageCleared ? null : openCase, caseRow, report, true);
          if (alert && alert.reason === "safety") alerts.push(alert);
        }
      } else if (decision.outcome === "hide") {
        action = "moderation.auto_hide";
        await holdTarget();
        caseRow = await upsertCase(decision.media.mediaReview);
        const alert = alertFor(openCase, caseRow, report, !isComment);
        if (alert && alert.reason === "safety") alerts.push(alert);
        if (!isComment) {
          const copy = decision.safetyRisk
            ? OWNER_NOTIFICATIONS.withModeratorSafety
            : OWNER_NOTIFICATIONS.withModerator;
          await notifyOwner(tx, report, copy, pendingPushes);
        }
      } else {
        // keep: the content stays up; the open case gets the AI's view.
        action = "moderation.keep";
        evidenceApproved = await approveDecidedMedia(tx, report.id, decision.media.approveIds, plan.photoScopes);
        caseRow = await upsertCase(decision.media.mediaReview);
        const alert = alertFor(openCase, caseRow, report, !isComment);
        if (alert && alert.reason === "safety") alerts.push(alert);
      }

      await keywordRulesService.recordDetections(tx, plan.hits);
      await auditService.record(tx, {
        actorKind: decision.decidedBy,
        action,
        targetType: run.target_type,
        targetId: run.target_id,
        reportId: run.report_id,
        caseId: caseRow?.id ?? null,
        reasonCode: reasons[0] ?? null,
        metadata: {
          runId: run.id,
          trigger: run.trigger,
          // Review R1: what the run was decided as, when D19 overrode its trigger.
          ...(trigger !== run.trigger ? { decidedAs: trigger } : {}),
          mode: decision.mode,
          outcome: decision.outcome,
          contentVersion: run.content_version,
          before: { moderationState: beforeState },
          after: { moderationState: afterState },
          holdReasons: reasons,
          categories: decision.categories,
          aiStatus: plan.ai.status,
          aiRecommendation: plan.ai.assessment?.recommendation ?? null,
          aiConfidence: plan.ai.assessment?.confidence ?? null,
          safetyRisk: decision.safetyRisk,
          keywordRuleIds: [...new Set(plan.hits.map((hit) => hit.ruleId).filter(Boolean))],
          detectorHits: plan.hits.filter((hit) => hit.ruleId === null).length,
          evidenceApproved,
          mediaReview: decision.media.mediaReview,
          firstPublish,
        },
      });

      return { runId: run.id, outcome: decision.outcome, mode: decision.mode };
    });

    dispatchAfterCommit(pendingPushes, alerts);
    return summary;
  }

  // ── Terminal path (§5.2) ─────────────────────────────────────────────────

  /**
   * An exhausted run (`attempts > max_attempts`): no stage runs. Pending
   * content is held — `ai_unavailable` if the last error was an AI failure,
   * `system_error` otherwise — so it always ends in front of a human rather
   * than pending forever. Published content under a flag re-check is *kept*
   * (D8: nothing is hidden without a verbatim AI finding), and new files on a
   * live report wait in Media Review.
   */
  async terminal(run: ClaimedRun, ctx: PipelineContext): Promise<RunSummary> {
    const token = run.attempts;
    const holdReason = terminalHoldReason(run.error);
    const pendingPushes: PendingPush[] = [];
    const alerts: PendingAlert[] = [];
    const isComment = run.target_type === "comment";

    const summary = await sequelize.transaction(async (tx): Promise<RunSummary> => {
      await setLockTimeout(tx);
      const snapshot = await this.loadSnapshot(run, tx);
      const guard = guardRun(this.guardInput(run, snapshot));
      if (!guard.ok) {
        if (guard.reason === "private_target" && snapshot.report) {
          await this.approvePrivateInTx(tx, run, token, snapshot, pendingPushes);
        } else {
          await this.cancelInTx(tx, run, token, guard.reason);
        }
        return { runId: run.id, outcome: "noop", mode: null, reason: guard.reason };
      }

      const report = snapshot.report as Report;
      const comment = snapshot.comment;
      const openCase = await moderationCaseService.findOpenCase(tx, run.target_type, run.target_id, {
        lock: true,
      });
      if (ctx.signal.aborted) throw new ShutdownAbort();

      const outcome: RunOutcome = guard.mode === "flag" ? "keep" : "hold";
      const reasons: HoldReason[] =
        guard.mode === "evidence" ? [holdReason, "media_unassessed"] : [holdReason];
      // D19: an exhausted resubmission check is still a resubmission. Without
      // the reason the case would look like a pure outage hold, and the
      // reconciler's automatic re-run could then let the AI alone approve it.
      // Review R1: that is a property of the report, not of this run's
      // trigger — an exhausted `evidence` run on a report still owed its
      // check is the same hold.
      const trigger = guard.mode === "content" ? await decisionTrigger(tx, run, report) : run.trigger;
      if (guard.mode === "content" && trigger === "resubmitted") reasons.push("resubmission");
      const finished = await this.fencedFinish(tx, run, token, {
        status: "done",
        outcome,
        reasons,
        error: run.error ?? `${SYSTEM_ERROR_PREFIX}exhausted`,
      });
      if (!finished) throw new FencingLost();

      const urgent = !isComment && Boolean(report.urgent);
      const beforeState = isComment ? comment?.moderation_state ?? null : report.moderation_state;
      let afterState = beforeState;

      if (guard.mode === "content") {
        if (isComment && comment) {
          await setCommentState(tx, comment.id, { moderationState: "held" });
        } else {
          await report.update({ moderation_state: "held", moderated_at: nowIso() }, { transaction: tx });
        }
        afterState = "held";
      }

      const caseRow = await moderationCaseService.upsertOpenCase(tx, {
        targetType: run.target_type,
        targetId: run.target_id,
        reportId: run.report_id,
        commentId: run.comment_id ?? null,
        mediaReview: guard.mode === "evidence",
        holdReasons: reasons,
        urgent,
        latestRunId: run.id,
      });

      if (guard.mode === "content") {
        const alert = alertFor(openCase, caseRow, report, !isComment);
        if (alert) alerts.push(alert);
        if (!isComment && !isQuietRerun(trigger, openCase)) {
          await notifyOwner(tx, report, OWNER_NOTIFICATIONS.withModerator, pendingPushes);
        }
      }

      await auditService.record(tx, {
        actorKind: "system",
        action: "moderation.hold",
        targetType: run.target_type,
        targetId: run.target_id,
        reportId: run.report_id,
        caseId: caseRow.id,
        reasonCode: holdReason,
        metadata: {
          runId: run.id,
          trigger: run.trigger,
          ...(trigger !== run.trigger ? { decidedAs: trigger } : {}),
          mode: guard.mode,
          outcome,
          terminal: true,
          attempts: run.attempts,
          maxAttempts: run.max_attempts,
          contentVersion: run.content_version,
          before: { moderationState: beforeState },
          after: { moderationState: afterState },
          holdReasons: reasons,
        },
      });

      return { runId: run.id, outcome, mode: guard.mode, reason: holdReason };
    });

    dispatchAfterCommit(pendingPushes, alerts);
    return summary;
  }

  // ── Requeue: backoff, breaker parking, shutdown release (§5.2) ───────────

  /**
   * Put a failed run back in the queue, fenced. `consumeAttempt: false` hands
   * the attempt back (the engine was never called — the breaker was open).
   * Returns false when the token no longer matches (another worker owns it).
   */
  async reschedule(
    run: ClaimedRun,
    options: { errorCode: string; delayMs: number; consumeAttempt: boolean },
  ): Promise<boolean> {
    return this.requeue(run, {
      error: options.errorCode.slice(0, 512),
      availableAt: Date.now() + Math.max(0, Math.round(options.delayMs)),
      attemptsDelta: options.consumeAttempt ? 0 : -1,
      maxAttemptsDelta: 0,
    });
  }

  /**
   * Shutdown: give an in-flight run back without consuming an attempt (§5.2).
   *
   * Deviation from the letter of §5.2 (`attempts = attempts − 1`), on purpose:
   * the in-flight work may still be running when the row is released, and if
   * another replica re-claimed a decremented row its `attempts` would equal the
   * old token again — the stale worker's fenced write would then match. Keeping
   * `attempts` and granting one more attempt (`max_attempts + 1`) has the same
   * effect on the budget while keeping every token unique.
   */
  async release(run: ClaimedRun): Promise<boolean> {
    return this.requeue(run, {
      error: null,
      availableAt: Date.now(),
      attemptsDelta: 0,
      maxAttemptsDelta: 1,
    });
  }

  /**
   * The fenced requeue. `uq_moderation_runs_queued` allows one queued row per
   * target, and an edit, flag or evidence commit may have queued a sibling
   * while this run was running. Then this run is merged into the sibling —
   * `resubmitted` stays sticky (D19), priority and content version take the
   * larger value, the attempt budget the smaller (an urgent run's short
   * budget survives the merge, D5/D21 — review R2), a flag re-check's
   * `case_id` is kept — and cancelled, exactly as the enqueue upsert would have
   * merged it.
   */
  private async requeue(
    run: ClaimedRun,
    change: { error: string | null; availableAt: number; attemptsDelta: number; maxAttemptsDelta: number },
  ): Promise<boolean> {
    const token = run.attempts;
    for (let round = 0; round < 2; round += 1) {
      try {
        return await sequelize.transaction(async (tx) => {
          await setLockTimeout(tx);
          const mine = await sequelize.query<{ id: string }>(
            `SELECT id FROM moderation_runs
              WHERE id = :id AND status = 'running' AND attempts = :token AND started_at = :claimedAt
              FOR UPDATE`,
            {
              replacements: { id: run.id, token, claimedAt: run.started_at ?? null },
              type: QueryTypes.SELECT,
              transaction: tx,
            },
          );
          if (mine.length === 0) return false;

          const siblings = await sequelize.query<{ id: string }>(
            `SELECT id FROM moderation_runs
              WHERE target_type = :targetType AND target_id = :targetId AND status = 'queued'
              LIMIT 1
              FOR UPDATE`,
            {
              replacements: { targetType: run.target_type, targetId: run.target_id },
              type: QueryTypes.SELECT,
              transaction: tx,
            },
          );
          const sibling = siblings[0];
          if (sibling) {
            await sequelize.query(
              `UPDATE moderation_runs
                  SET "trigger" = CASE WHEN "trigger" = 'resubmitted' OR :trigger = 'resubmitted'
                                       THEN 'resubmitted' ELSE "trigger" END,
                      content_version = GREATEST(content_version, :contentVersion),
                      priority = GREATEST(priority, :priority),
                      max_attempts = LEAST(max_attempts, :maxAttempts),
                      case_id = COALESCE(case_id, :caseId),
                      updated_on = now()
                WHERE id = :siblingId`,
              {
                replacements: {
                  trigger: run.trigger,
                  contentVersion: run.content_version,
                  priority: run.priority,
                  // Review R2: the enqueue upsert's LEAST, mirrored — without
                  // it an urgent run folded into a default-budget sibling got
                  // four more attempts (~9 min) instead of reaching a human
                  // in ~1.5 min.
                  maxAttempts: run.max_attempts,
                  caseId: run.case_id ?? null,
                  siblingId: sibling.id,
                },
                transaction: tx,
              },
            );
            await sequelize.query(
              `UPDATE moderation_runs
                  SET status = 'cancelled', outcome = 'noop', locked_until = NULL,
                      finished_at = :now, error = COALESCE(:error, error), updated_on = now()
                WHERE id = :id`,
              { replacements: { id: run.id, now: nowIso(), error: change.error }, transaction: tx },
            );
            return true;
          }

          await sequelize.query(
            `UPDATE moderation_runs
                SET status = 'queued',
                    attempts = GREATEST(attempts + :attemptsDelta, 0),
                    max_attempts = max_attempts + :maxAttemptsDelta,
                    locked_until = NULL,
                    available_at = :availableAt,
                    error = COALESCE(:error, error),
                    updated_on = now()
              WHERE id = :id`,
            {
              replacements: {
                id: run.id,
                attemptsDelta: change.attemptsDelta,
                maxAttemptsDelta: change.maxAttemptsDelta,
                availableAt: change.availableAt,
                error: change.error,
              },
              transaction: tx,
            },
          );
          return true;
        });
      } catch (err) {
        // A sibling was queued between the check and the requeue: merge into
        // it on the second round.
        if (err instanceof UniqueConstraintError && round === 0) continue;
        throw err;
      }
    }
    return false;
  }

  // ── Endings without a decision ───────────────────────────────────────────

  /** The pre-flight guard said no: cancel, or approve a private target (D3). */
  private async finishWithoutDecision(
    run: ClaimedRun,
    reason: CancelReason,
    ctx: PipelineContext,
  ): Promise<RunSummary> {
    const token = run.attempts;
    const pendingPushes: PendingPush[] = [];
    const summary = await sequelize.transaction(async (tx): Promise<RunSummary> => {
      await setLockTimeout(tx);
      if (reason === "private_target") {
        const snapshot = await this.loadSnapshot(run, tx);
        const guard = guardRun(this.guardInput(run, snapshot));
        if (!guard.ok && guard.reason === "private_target" && snapshot.report) {
          await this.approvePrivateInTx(tx, run, token, snapshot, pendingPushes);
          return { runId: run.id, outcome: "noop", mode: null, reason };
        }
        const settled: CancelReason = guard.ok ? "state_changed" : guard.reason;
        await this.cancelInTx(tx, run, token, settled);
        return { runId: run.id, outcome: "noop", mode: null, reason: settled };
      }
      if (ctx.signal.aborted) throw new ShutdownAbort();
      await this.cancelInTx(tx, run, token, reason);
      return { runId: run.id, outcome: "noop", mode: null, reason };
    });
    dispatchAfterCommit(pendingPushes);
    return summary;
  }

  /** `noop`: the run is closed, the target untouched, the reason audited. */
  private async cancelInTx(
    tx: Transaction,
    run: ClaimedRun,
    token: number,
    reason: CancelReason,
  ): Promise<void> {
    const finished = await this.fencedFinish(tx, run, token, {
      status: "cancelled",
      outcome: "noop",
      reasons: null,
      error: null,
    });
    if (!finished) throw new FencingLost();
    await auditService.record(tx, {
      actorKind: "system",
      action: "moderation.cancel",
      targetType: run.target_type,
      targetId: run.target_id,
      reportId: run.report_id,
      caseId: run.case_id ?? null,
      reasonCode: reason,
      metadata: { runId: run.id, trigger: run.trigger, reason, contentVersion: run.content_version },
    });
  }

  /** D3 inside a run: close the run and approve the private target without AI. */
  private async approvePrivateInTx(
    tx: Transaction,
    run: ClaimedRun,
    token: number,
    snapshot: Snapshot,
    pendingPushes: PendingPush[],
  ): Promise<void> {
    const finished = await this.fencedFinish(tx, run, token, {
      status: "cancelled",
      outcome: "noop",
      reasons: null,
      error: null,
    });
    if (!finished) throw new FencingLost();
    const report = snapshot.report as Report;
    const changed = await approvePrivateContent(tx, report, snapshot.comment, pendingPushes);
    await auditService.record(tx, {
      actorKind: "system",
      action: changed ? "moderation.auto_approve" : "moderation.cancel",
      targetType: run.target_type,
      targetId: run.target_id,
      reportId: run.report_id,
      reasonCode: "private_target",
      metadata: { runId: run.id, trigger: run.trigger, reason: "private_target", aiSent: false },
    });
  }

  // ── The fenced result write ──────────────────────────────────────────────

  /**
   * Write a run's result, fenced on its claim token. Returns false when zero
   * rows matched — the lease was lost and the caller must drop everything.
   */
  private async fencedFinish(
    tx: Transaction,
    run: ClaimedRun,
    token: number,
    fields: FinishFields,
  ): Promise<boolean> {
    const assessment = fields.ai?.assessment ?? null;
    const rows = await sequelize.query<{ id: string }>(
      `UPDATE moderation_runs
          SET status = :status,
              outcome = :outcome,
              reasons = CAST(:reasons AS jsonb),
              ai_status = :aiStatus,
              ai_recommendation = :aiRecommendation,
              ai_confidence = :aiConfidence,
              ai_categories = CAST(:aiCategories AS jsonb),
              ai_summary = :aiSummary,
              ai_language = :aiLanguage,
              safety_risk = :safetyRisk,
              ai_model = :aiModel,
              policy_version = :policyVersion,
              ai_duration_ms = :aiDurationMs,
              injection_suspected = :injectionSuspected,
              block_reason = :blockReason,
              keyword_hits = CAST(:keywordHits AS jsonb),
              images_assessed = :imagesAssessed,
              error = :error,
              finished_at = :now,
              locked_until = NULL,
              updated_on = now()
        WHERE id = :id AND status = 'running' AND attempts = :token AND started_at = :claimedAt
        RETURNING id`,
      {
        replacements: {
          id: run.id,
          token,
          // A null would never match — the safe direction: the lease expires
          // and the run is re-claimed (the claim always stamps it).
          claimedAt: run.started_at ?? null,
          status: fields.status,
          outcome: fields.outcome,
          reasons: fields.reasons && fields.reasons.length > 0 ? JSON.stringify(fields.reasons) : null,
          aiStatus: fields.ai?.status ?? null,
          aiRecommendation: assessment?.recommendation ?? null,
          aiConfidence: assessment ? assessment.confidence : null,
          aiCategories: assessment ? JSON.stringify(assessment.categories) : null,
          aiSummary: assessment?.summary ? assessment.summary : null,
          aiLanguage: assessment?.language ? assessment.language.slice(0, 16) : null,
          safetyRisk: assessment?.safetyRisk ?? null,
          aiModel: assessment?.meta.model ? assessment.meta.model.slice(0, 64) : null,
          policyVersion: assessment?.meta.policyVersion ? assessment.meta.policyVersion.slice(0, 32) : null,
          aiDurationMs: fields.aiDurationMs ?? null,
          injectionSuspected: assessment ? assessment.injectionSuspected : null,
          blockReason: assessment?.blockReason ? assessment.blockReason.slice(0, 64) : null,
          keywordHits: fields.hits && fields.hits.length > 0 ? JSON.stringify(fields.hits) : null,
          imagesAssessed: fields.imagesAssessed ?? null,
          error: fields.error ? fields.error.slice(0, 512) : null,
          now: nowIso(),
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );
    return rows.length > 0;
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  /**
   * The target and the facts the guard needs. With a transaction the target row
   * is locked `FOR UPDATE` — the first lock of every apply (§5.3 step 6) — and
   * a flag re-check's case last.
   *
   * A comment's parent report is locked right after the comment, `FOR NO KEY
   * UPDATE` (review R4). Read plain, it let the apply approve a comment — bump
   * `comment_count` and push "Someone replied to your report" — on a report
   * whose deletion had just committed, and it made the known deadlock: worker
   * comment → case → report against deletion report → case. Locked, the guard
   * sees `deleted_at` under the lock and the order is comment → report → case,
   * as in `setCommentState` and account deletion. Not `FOR SHARE`: two comment
   * applies on one report would both need to upgrade it for the counter
   * UPDATE and deadlock each other; `NO KEY UPDATE` is exactly the lock that
   * UPDATE takes, so they queue instead.
   */
  private async loadSnapshot(run: ClaimedRun, tx: Transaction | null): Promise<Snapshot> {
    const locked = tx ? { transaction: tx, lock: tx.LOCK.UPDATE } : {};
    const plain = tx ? { transaction: tx } : {};

    let report: Report | null;
    let comment: ReportComment | null = null;
    if (run.target_type === "comment") {
      comment = await ReportComment.findByPk(run.comment_id ?? run.target_id, locked);
      report = await Report.findByPk(run.report_id, tx ? { transaction: tx, lock: tx.LOCK.NO_KEY_UPDATE } : {});
    } else {
      report = await Report.findByPk(run.report_id, locked);
    }

    const pendingEvidenceCount =
      run.target_type === "report" && report
        ? await ReportEvidence.count({
            where: { report_id: report.id, moderation_state: "pending", upload_state: "sealed" },
            ...plain,
          })
        : 0;

    let caseOpen = false;
    if (run.case_id) {
      const row = await moderationCaseService.findById(tx, run.case_id, { lock: Boolean(tx) });
      caseOpen = Boolean(row && row.state === "open" && row.target_id === run.target_id);
    }
    return { report, comment, pendingEvidenceCount, caseOpen };
  }

  private guardInput(run: ClaimedRun, snapshot: Snapshot): GuardInput {
    const { report, comment } = snapshot;
    return {
      trigger: run.trigger,
      targetType: run.target_type,
      runContentVersion: run.content_version,
      report: report
        ? {
            exists: true,
            deleted: Boolean(report.deleted_at),
            visibility: report.visibility,
            moderationState: report.moderation_state,
            contentVersion: report.content_version,
          }
        : { exists: false, deleted: false, visibility: "public", moderationState: "pending", contentVersion: 0 },
      comment:
        run.target_type === "comment"
          ? comment
            ? { exists: true, status: comment.status, moderationState: comment.moderation_state }
            : { exists: false, status: "removed", moderationState: "pending" }
          : null,
      pendingEvidenceCount: snapshot.pendingEvidenceCount,
      caseOpen: snapshot.caseOpen,
    };
  }

  /**
   * §5.3: "author not active → author_banned". A severed report (no author) or
   * an erased account has no standing to judge, and is not treated as banned.
   */
  private async authorActive(userId: string | null): Promise<boolean> {
    if (!userId) return true;
    const user = await AppUser.findByPk(userId, { attributes: ["id", "status"] });
    return !user || user.status === "active";
  }

  /** The `report_evidence` columns `photoSourceFor` needs, plus ordering. */
  private static readonly PHOTO_ATTRIBUTES = [
    "id",
    "kind",
    "mime",
    "bytes",
    "storage_key",
    "sha256",
    "thumb_key",
    "thumb_sha256",
    "sort_order",
  ];

  /**
   * The report's sealed, pending evidence, split into photos the AI can see (up
   * to `MODERATION_MAX_IMAGES`, S3 only — each with the sealed object it will be
   * shown and that object's hash, `photoSourceFor`, review R5) and files it
   * cannot (D22).
   */
  private async pendingMedia(
    reportId: string,
  ): Promise<{ candidates: PhotoCandidate[]; unassessableIds: string[] }> {
    const rows = await ReportEvidence.findAll({
      where: { report_id: reportId, moderation_state: "pending", upload_state: "sealed" },
      attributes: ModerationPipeline.PHOTO_ATTRIBUTES,
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });
    const candidates: PhotoCandidate[] = [];
    const unassessableIds: string[] = [];
    const cap = Math.max(0, env.moderation.maxImages);
    for (const row of rows) {
      const source = s3Service.isEnabled && candidates.length < cap ? photoSourceFor(row) : null;
      if (source) candidates.push({ id: row.id, ...source, pending: true });
      else unassessableIds.push(row.id);
    }
    return { candidates, unassessableIds };
  }

  /**
   * Approved photos of a report, sent as context on a report's flag re-check
   * only (never a comment's, review R8): a flag may be about a picture, and the
   * moderator should get the AI's view of it. They are never decided by the run
   * (and D8 never hides on a picture). Chosen and verified like pending photos.
   */
  private async approvedPhotos(reportId: string, slots: number): Promise<PhotoCandidate[]> {
    if (slots <= 0 || !s3Service.isEnabled) return [];
    const rows = await ReportEvidence.findAll({
      where: {
        report_id: reportId,
        moderation_state: "approved",
        upload_state: "sealed",
        kind: "photo",
      },
      attributes: ModerationPipeline.PHOTO_ATTRIBUTES,
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });
    const photos: PhotoCandidate[] = [];
    for (const row of rows) {
      if (photos.length >= slots) break;
      const source = photoSourceFor(row);
      if (source) photos.push({ id: row.id, ...source, pending: false });
    }
    return photos;
  }

  /**
   * Download the chosen sealed object of each photo for the AI and verify it
   * against the hash sealed at commit (review R5) — the AI is never shown bytes
   * an approval would not cover. A photo whose object is missing, replaced
   * (hash mismatch), too large, not a JPEG/PNG/WebP, or slow is not retried:
   * its file simply joins the files the AI could not see, and waits for a
   * moderator (D22).
   */
  private async fetchPhotos(
    candidates: readonly PhotoCandidate[],
    ctx: PipelineContext,
  ): Promise<{
    sent: Array<PhotoCandidate & { image: AiAssessImage }>;
    failedPendingIds: string[];
  }> {
    const results = await Promise.all(
      candidates.map(async (candidate) => {
        if (ctx.signal.aborted) return { candidate, image: null };
        try {
          const bytes = await withTimeout(
            s3Service.getObjectBytes(candidate.key, { maxBytes: AI_LIMITS.maxImageBytes }),
            THUMB_FETCH_TIMEOUT_MS,
          );
          const image = verifiedEngineImage(bytes, candidate.sha256);
          if (!image) {
            logger.warn("[moderation] photo not sent for assessment — not the sealed bytes, or not a readable image", {
              evidenceId: candidate.id,
              scope: candidate.scope,
            });
          }
          return { candidate, image };
        } catch (err) {
          logger.warn("[moderation] photo unavailable for assessment", {
            evidenceId: candidate.id,
            scope: candidate.scope,
            error: err instanceof Error ? err.name : "unknown",
          });
          return { candidate, image: null };
        }
      }),
    );
    if (ctx.signal.aborted) throw new ShutdownAbort();

    const sent: Array<PhotoCandidate & { image: AiAssessImage }> = [];
    const failedPendingIds: string[] = [];
    for (const { candidate, image } of results) {
      if (image) sent.push({ ...candidate, image });
      else if (candidate.pending) failedPendingIds.push(candidate.id);
    }
    return { sent: sent.slice(0, AI_LIMITS.maxImages), failedPendingIds };
  }

  /**
   * D8: a flag re-check tells the AI *which* categories were flagged — the set,
   * never notes or counts (`flaggedCategoriesFor`, which also normalises legacy
   * codes and limits comment flags to the six comment categories). Review Q2:
   * flags from a reporter who is no longer active (banned, suspended) are left
   * out, so a banned brigader's flag cannot aim the AI at a category.
   */
  private async openFlagCategories(run: ClaimedRun): Promise<PolicyCategory[]> {
    const rows = await ReportFlag.findAll({
      where:
        run.target_type === "comment"
          ? { comment_id: run.target_id, status: "open" }
          : { report_id: run.target_id, comment_id: null, status: "open" },
      attributes: ["reason", "reporter_id"],
    });
    const reporterIds = [
      ...new Set(rows.map((row) => row.reporter_id).filter((id): id is string => Boolean(id))),
    ];
    const reporters = reporterIds.length
      ? await AppUser.findAll({
          where: { id: { [Op.in]: reporterIds } },
          attributes: ["id", "status"],
          paranoid: false,
        })
      : [];
    const statusOf = new Map(reporters.map((row) => [row.id, row.status as string]));
    return flaggedCategoriesFor(
      rows.map((row) => ({
        reason: row.reason,
        reporterId: row.reporter_id ?? null,
        reporterStatus: row.reporter_id ? statusOf.get(row.reporter_id) ?? null : null,
      })),
      run.target_type,
    );
  }

  /**
   * D8's two history facts for a flag re-check: has a human cleared this content
   * version (a report's `human_reviewed_version`; for a comment, a case a
   * moderator resolved `approved`), and was this version already auto-hidden
   * once ("at most one auto-hide per version").
   */
  private async flagFacts(
    run: ClaimedRun,
    report: Report,
  ): Promise<{ humanCleared: boolean; autoHidden: boolean }> {
    let humanCleared: boolean;
    if (run.target_type === "report") {
      humanCleared = report.human_reviewed_version === run.content_version;
    } else {
      const cleared = await sequelize.query<{ id: string }>(
        `SELECT id FROM moderation_cases
          WHERE target_type = 'comment' AND target_id = :targetId
            AND state = 'resolved' AND resolution = 'approved' AND resolved_by IS NOT NULL
          LIMIT 1`,
        { replacements: { targetId: run.target_id }, type: QueryTypes.SELECT },
      );
      humanCleared = cleared.length > 0;
    }
    const hidden = await sequelize.query<{ id: string }>(
      `SELECT id FROM moderation_runs
        WHERE target_type = :targetType AND target_id = :targetId
          AND status = 'done' AND outcome = 'hide'
          ${run.target_type === "report" ? "AND content_version = :contentVersion" : ""}
        LIMIT 1`,
      {
        replacements: {
          targetType: run.target_type,
          targetId: run.target_id,
          contentVersion: run.content_version,
        },
        type: QueryTypes.SELECT,
      },
    );
    return { humanCleared, autoHidden: hidden.length > 0 };
  }

  /**
   * The §6.1 request. `runId` is the run's UUID without dashes. Keyword hits
   * with an actionable rule (`signal`, `hold`) go as hints — never `monitor`
   * hits, which are only for the record — deduplicated and capped at 20.
   */
  private buildRequest(
    run: ClaimedRun,
    report: Report,
    body: string,
    hits: readonly KeywordHit[],
    flaggedCategories: readonly PolicyCategory[],
    images: readonly AiAssessImage[],
  ): AiAssessRequest {
    const isComment = run.target_type === "comment";
    const signals: AiKeywordSignal[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (hit.action === "monitor") continue;
      const term = clip(hit.term.replace(/\*$/, "").trim(), 100);
      const key = `${hit.category}|${term.toLowerCase()}`;
      if (!term || seen.has(key)) continue;
      seen.add(key);
      signals.push({ category: hit.category, term });
      if (signals.length >= AI_LIMITS.maxKeywordSignals) break;
    }
    return {
      runId: run.id.replace(/-/g, "").toLowerCase(),
      targetType: run.target_type,
      category: (report.category as AiReportCategory) ?? null,
      title: isComment ? null : clipOrNull(report.title, AI_LIMITS.maxTitleChars),
      body: clip(body, AI_LIMITS.maxBodyChars),
      locationLabel: isComment ? null : clipOrNull(report.location_label, AI_LIMITS.maxLocationLabelChars),
      parentTitle: isComment ? clipOrNull(report.title, AI_LIMITS.maxParentTitleChars) : null,
      urgent: !isComment && Boolean(report.urgent),
      flaggedCategories: [...flaggedCategories].slice(0, AI_LIMITS.maxFlaggedCategories),
      keywordSignals: signals,
      images: [...images].slice(0, AI_LIMITS.maxImages),
    };
  }
}

export const moderationPipeline = new ModerationPipeline();
export default moderationPipeline;
