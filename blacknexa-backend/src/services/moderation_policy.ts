/**
 * The moderation policy — what a run decides, as a pure function.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.3 steps 1 and 5, §5.4, D4, D5, D8, D9, D19,
 * D21 and D22. Everything that turns "what the keyword stage and the AI said"
 * into approve / hold / hide / keep lives here, and nothing else does.
 *
 * ── Why pure ──────────────────────────────────────────────────────────────
 * No env, no database, no logger, no clock. Thresholds and fallbacks are passed
 * in (`env.moderation.*` is read by the pipeline, not here), so `npm test`
 * exercises every row of the trigger × state table and every hold rule without a
 * `.env`, and a policy change is reviewable as a diff of this file and its test.
 * The only imports are the dependency-free vocabulary and the pure matcher (for
 * D8's verbatim check).
 *
 * ── The two questions, in order ───────────────────────────────────────────
 * 1. `guardRun()` — may this run act on its target *at all*? It is asked twice:
 *    before the AI call (to skip wasted work) and again inside the apply
 *    transaction with the target row locked, because a moderator, an edit or a
 *    deletion may have landed while the AI was thinking (§5.4 "Owner edits during
 *    a run", "Moderator decides during a run"). A failed guard is a `noop`.
 * 2. `decide()` — given the guard's mode and the stages' results, the outcome.
 *
 * ── The trigger × state table (§5.3), and the three modes ─────────────────
 *
 *   trigger                                 target must be          mode
 *   filed · edited · resubmitted · manual   report `pending`        content  → approve · hold
 *   comment (comment target)                comment `pending`       content  → approve · hold
 *   evidence                                report `approved`,      evidence → approve · hold
 *                                           sealed evidence pending            (media only)
 *   flagged                                 target `approved` and   flag     → hide · keep
 *                                           `run.case_id` still open
 *
 * Two extensions, both forced by the enqueue merge (`moderation_enqueue.ts`
 * keeps one *queued* row per target, and a merge takes the newer trigger):
 *
 *   • `evidence` on a `pending` report → **content**. A queued filing or edit
 *     run absorbed an evidence commit and became `evidence`; the report still
 *     needs its approve/hold decision, and that run assesses the new photos too.
 *     A strict reading would drop it as a noop and leave the report pending
 *     until the reconciler noticed.
 *   • `evidence` on an `approved` report whose `run.case_id` is an open case →
 *     **flag**. A queued flag re-check absorbed an evidence commit (the merge
 *     keeps `case_id`); the re-check must still happen. Every flag-mode run also
 *     assesses pending photos, so neither trigger is lost in either direction.
 *
 * ── Evidence mode never un-publishes text ─────────────────────────────────
 * An evidence run happens because files were added to a report whose text is
 * already live — often after a human looked at it. Its decision covers the new
 * files only: clean photos are approved, anything else stays pending for the
 * *Media Review* tab (D22). The report's own state is never changed by it, so a
 * late upload can neither re-litigate approved text nor take a report down
 * because a video cannot be seen by the AI.
 *
 * An outage is the exception to "anything else waits for a human" (review
 * R13): photos the AI *could* have assessed but did not reach are held
 * `ai_unavailable` — not `media_unassessed` — so the case is outage-only and
 * the reconciler re-runs it once the engine is back (D5: an outage must not
 * leave a permanent human backlog). Only files the AI can never see are marked
 * for media review.
 *
 * ── Media (D22) ───────────────────────────────────────────────────────────
 * The AI sees photo thumbnails; `imagesAssessed` says how many, from the front of
 * the request. A photo it assessed, on a verdict that released the content, is
 * approved. Everything it did not assess — video, audio, documents, photos
 * without a thumbnail or beyond the cap — waits for a moderator
 * (`media_unassessed`, case `media_review`), while the text may still publish.
 * `MODERATION_UNASSESSED_MEDIA=publish` approves those instead, but only on a
 * fully clean verdict. On a hold nothing is approved: the moderator's approval
 * approves every pending file (§8.1).
 *
 * ── Signals that hold whatever the AI status is ───────────────────────────
 *   • `injectionSuspected` is the engine's deterministic prescreen, returned on
 *     every status (review R9). It holds even when the model itself was
 *     unavailable — otherwise a comment shaped to break the prompt would be
 *     published by the D5 comment fallback exactly when the engine failed on it.
 *   • `contentTruncated`: text longer than the engine accepts would reach the AI
 *     clipped, and approving it would publish words nobody assessed (review
 *     R10). It holds `content_too_long`; the AI still runs on the prefix, so the
 *     moderator gets its view and a safety risk in it still alerts (D21).
 */

import { verbatimInContent } from "@/services/moderation_keyword_matcher";
import {
  AI_LIMITS,
  COMMENT_FLAG_CATEGORIES,
  POLICY_CATEGORIES,
  isPolicyCategory,
  normaliseFlagCategory,
  type AiAssessment,
  type AiCategoryVerdict,
  type AiStatus,
  type CommentModerationState,
  type CommentStatus,
  type HoldReason,
  type KeywordHit,
  type ModerationTargetType,
  type PolicyCategory,
  type ReportModerationState,
  type RunTrigger,
  type SafetyRisk,
} from "@/types/moderation.interface";

// ─────────────────────────────────────────────────────────────────────────────
// Guard — §5.3 step 1 and the trigger × state table
// ─────────────────────────────────────────────────────────────────────────────

/** Which decision a run may make. See the file header. */
export type PolicyMode = "content" | "evidence" | "flag";

/** Why a run ends as `noop` instead of deciding. Recorded in the audit row. */
export type CancelReason =
  | "target_missing"
  | "report_deleted"
  | "comment_removed"
  | "private_target"
  | "stale_version"
  | "state_changed"
  | "case_closed"
  | "nothing_pending";

/** The target's state as the guard needs it — read plain, or under the lock. */
export interface GuardInput {
  trigger: RunTrigger;
  targetType: ModerationTargetType;
  /** `moderation_runs.content_version`. Ignored for comments (they have none). */
  runContentVersion: number;
  report: {
    exists: boolean;
    deleted: boolean;
    visibility: string;
    moderationState: ReportModerationState;
    contentVersion: number;
  };
  /** Required for comment targets. */
  comment?: {
    exists: boolean;
    status: CommentStatus;
    moderationState: CommentModerationState;
  } | null;
  /** Sealed evidence on the report still `pending`. */
  pendingEvidenceCount: number;
  /** `run.case_id` is set and that case is still `open`. */
  caseOpen: boolean;
}

export type GuardResult = { ok: true; mode: PolicyMode } | { ok: false; reason: CancelReason };

/** Triggers that ask for an approve/hold decision on pending content. */
const CONTENT_TRIGGERS: readonly RunTrigger[] = ["filed", "edited", "resubmitted", "manual", "comment"];

/**
 * May this run act on its target, and how? Cancel conditions first (§5.3 step
 * 1: deleted report, deactivated report — review Q8 — private target, removed
 * comment, stale version), then the trigger × state table.
 */
export function guardRun(input: GuardInput): GuardResult {
  const { report } = input;
  if (!report.exists) return { ok: false, reason: "target_missing" };
  if (report.deleted) return { ok: false, reason: "report_deleted" };
  // Review Q8: a deactivated report — or anything on it — has nothing left
  // for a run to decide until Reactivate (D10). Deactivation supersedes every
  // case on the report and its comments and withdraws their queued runs, but
  // a comment run already claimed used to carry on (comment targets never
  // looked at the parent's state): it held the comment and opened a case no
  // one could decide (decisions answer 409 on a deactivated report), or
  // approved it — bumping `comment_count` and telling the owner of a
  // taken-down report "Someone replied". Checked before the private branch
  // too, so nothing is approved on a deactivated report either; Reactivate
  // lets the reconciler resume the comments' moderation where it stopped.
  if (report.moderationState === "deactivated") return { ok: false, reason: "state_changed" };
  // D3: private content is never sent to the AI. The pipeline approves it
  // instead of cancelling silently (see `approvePrivateTarget`).
  if (report.visibility === "private") return { ok: false, reason: "private_target" };

  if (input.targetType === "comment") {
    const comment = input.comment;
    if (!comment || !comment.exists) return { ok: false, reason: "target_missing" };
    // Hidden or removed by a moderator or the author: nothing to publish.
    if (comment.status !== "visible") return { ok: false, reason: "comment_removed" };
    if (input.trigger === "flagged") {
      if (comment.moderationState !== "approved") return { ok: false, reason: "state_changed" };
      return input.caseOpen ? { ok: true, mode: "flag" } : { ok: false, reason: "case_closed" };
    }
    return comment.moderationState === "pending"
      ? { ok: true, mode: "content" }
      : { ok: false, reason: "state_changed" };
  }

  // Report targets carry a content version; an older run's verdict is about
  // words the author has since replaced.
  if (input.runContentVersion < report.contentVersion) return { ok: false, reason: "stale_version" };

  switch (input.trigger) {
    case "flagged":
      if (report.moderationState !== "approved") return { ok: false, reason: "state_changed" };
      return input.caseOpen ? { ok: true, mode: "flag" } : { ok: false, reason: "case_closed" };
    case "evidence":
      if (report.moderationState === "pending") return { ok: true, mode: "content" };
      if (report.moderationState !== "approved") return { ok: false, reason: "state_changed" };
      if (input.caseOpen) return { ok: true, mode: "flag" };
      return input.pendingEvidenceCount > 0
        ? { ok: true, mode: "evidence" }
        : { ok: false, reason: "nothing_pending" };
    default:
      if (!CONTENT_TRIGGERS.includes(input.trigger)) return { ok: false, reason: "state_changed" };
      return report.moderationState === "pending"
        ? { ok: true, mode: "content" }
        : { ok: false, reason: "state_changed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision — §5.3 step 5
// ─────────────────────────────────────────────────────────────────────────────

/** `MODERATION_*_MIN_CONFIDENCE`, passed in by the pipeline. */
export interface PolicyThresholds {
  /** Below this overall confidence an `approve` recommendation still holds (0.8). */
  autoApproveMinConfidence: number;
  /** A category counts as violated at or above this confidence (0.5). */
  violationMinConfidence: number;
  /** A flagged item may be auto-hidden at or above this confidence (0.85). */
  flagAutohideMinConfidence: number;
}

/** The D5 / D22 fallbacks, passed in by the pipeline. */
export interface PolicyFallbacks {
  reportAiFallback: "hold" | "approve";
  commentAiFallback: "approve" | "hold";
  unassessedMedia: "review" | "publish";
}

/** How the AI stage ended, and its parsed answer when there is one. */
export interface PolicyAi {
  status: AiStatus;
  /** Present for `assessed` and `blocked` (and kept for `unavailable` when returned). */
  assessment: AiAssessment | null;
}

/** The pending evidence this run is responsible for. */
export interface PolicyMediaInput {
  /**
   * Pending photos whose thumbnails were put in the AI request, in request
   * order and at the front of it — `imagesAssessed` counts from the front.
   * Photos that would have been sent but the AI stage did not run are listed
   * too; with no assessment they are simply unassessed.
   */
  photoIds: readonly string[];
  /** Pending sealed evidence the AI cannot see (video, audio, documents, …). */
  unassessableIds: readonly string[];
}

export interface PolicyInput {
  mode: PolicyMode;
  trigger: RunTrigger;
  targetType: ModerationTargetType;
  /** False when the author's account exists and is not `active` (banned, suspended). */
  authorActive: boolean;
  /** False when the body could not be opened — held `content_unreadable`, AI not called. */
  contentReadable: boolean;
  /**
   * True when the text sent to the AI had to be clipped to the engine's limits
   * (`AI_LIMITS`), so part of what would be published was never assessed —
   * content mode holds it `content_too_long` (review R10).
   */
  contentTruncated: boolean;
  keywordHits: readonly KeywordHit[];
  ai: PolicyAi;
  media: PolicyMediaInput;
  /**
   * Flag mode: the texts an evidence quote must be verbatim in — every field
   * the AI was shown as content: title, body and location label for a report
   * (review R17), the body for a comment.
   */
  contentTexts: readonly string[];
  /** Flag mode: a human approved or kept this content version (`human_reviewed_version`). */
  humanClearedCurrentVersion: boolean;
  /** Flag mode: an earlier run already auto-hid this content version. */
  autoHiddenCurrentVersion: boolean;
  thresholds: PolicyThresholds;
  fallbacks: PolicyFallbacks;
}

/** What happens to the pending files. */
export interface MediaDecision {
  approveIds: string[];
  pendingIds: string[];
  /** Files wait for a moderator: the case needs `media_review`. */
  mediaReview: boolean;
}

export type PolicyOutcome = "approve" | "hold" | "hide" | "keep";

export interface PolicyDecision {
  mode: PolicyMode;
  outcome: PolicyOutcome;
  /**
   * The reasons behind a `hold` / `hide`, in the order they were found; on a
   * `keep`, the AI signals worth a moderator's attention. Never
   * `media_unassessed` — the pipeline adds that when `media.mediaReview`.
   */
  holdReasons: HoldReason[];
  /** Policy categories the reasons point at, first-seen order. */
  categories: PolicyCategory[];
  media: MediaDecision;
  /** The case's *AI Flags* source. */
  aiFlagged: boolean;
  /** The case's *Keyword Flags* source. */
  keywordFlagged: boolean;
  /** The AI's safety signal when it is not `none`. */
  safetyRisk: Exclude<SafetyRisk, "none"> | null;
  /** The AI marked a category violated with severity `high` (+20 priority). */
  highSeverityViolation: boolean;
  /** Audit actor: `ai` for decisions on an AI answer, `system` for fallbacks (§5.3). */
  decidedBy: "ai" | "system";
}

/** Hold reasons that come from the AI's answer — the case's *AI Flags* source. */
const AI_SOURCED_REASONS: readonly HoldReason[] = [
  "ai_violation",
  "ai_low_confidence",
  "ai_blocked",
  "injection_suspected",
  "safety_risk",
];

/** An insertion-ordered set, for reasons and categories. */
class Ordered<T> {
  private readonly items: T[] = [];
  add(value: T): void {
    if (!this.items.includes(value)) this.items.push(value);
  }
  has(value: T): boolean {
    return this.items.includes(value);
  }
  get size(): number {
    return this.items.length;
  }
  toArray(): T[] {
    return [...this.items];
  }
}

/** The AI stage gave no answer the policy can use (§5.3: unavailable / error / skipped). */
export function aiDown(status: AiStatus): boolean {
  return status === "unavailable" || status === "error" || status === "skipped";
}

/**
 * §5.3: "AI blocked → ai_blocked (category: graphic if the reason is sexual,
 * else other)". The engine echoes Gemini's reason codes; `PROHIBITED_CONTENT`
 * and `IMAGE_SAFETY` are what Gemini returns for sexual material (including
 * anything involving minors) and are treated as sexual too.
 */
export function blockCategory(blockReason: string | null | undefined): PolicyCategory {
  const reason = (blockReason ?? "").toUpperCase();
  return /SEXUAL|PROHIBITED_CONTENT|IMAGE_SAFETY|CSAM/.test(reason) ? "graphic" : "other";
}

function verdictFor(ai: PolicyAi, code: PolicyCategory): AiCategoryVerdict | undefined {
  if (ai.status !== "assessed" || !ai.assessment) return undefined;
  return ai.assessment.categories.find((verdict) => verdict.code === code);
}

function violatedAtLeast(ai: PolicyAi, code: PolicyCategory, min: number): boolean {
  const verdict = verdictFor(ai, code);
  return Boolean(verdict && verdict.violation && verdict.confidence >= min);
}

/**
 * The hold reasons an AI answer produces on its own: blocked, injection, safety
 * risk, violations, and — when nothing more specific explains a `review` or a
 * shaky `approve` — low confidence.
 */
function aiVerdictReasons(
  input: PolicyInput,
  reasons: Ordered<HoldReason>,
  categories: Ordered<PolicyCategory>,
  options: { includeLowConfidence: boolean },
): void {
  const { ai, thresholds } = input;
  const assessment = ai.assessment;

  if (ai.status === "blocked") {
    reasons.add("ai_blocked");
    categories.add(blockCategory(assessment?.blockReason));
  }
  // Review R9: the prescreen's signal counts whatever the status. The engine
  // returns it on `unavailable` too (and a permanent failure keeps the body as
  // `error`), and an injection that pushes the model into MAX_TOKENS or invalid
  // JSON must not be published by the comment fallback because of it.
  if (assessment?.injectionSuspected) {
    reasons.add("injection_suspected");
    categories.add("other");
  }
  if (ai.status !== "assessed" || !assessment) return;

  if (assessment.safetyRisk !== "none") reasons.add("safety_risk");

  const violated = assessment.categories.filter(
    (verdict) => verdict.violation && verdict.confidence >= thresholds.violationMinConfidence,
  );
  if (violated.length > 0) {
    reasons.add("ai_violation");
    for (const verdict of violated) categories.add(verdict.code);
  } else if (
    options.includeLowConfidence &&
    (assessment.recommendation !== "approve" ||
      assessment.confidence < thresholds.autoApproveMinConfidence)
  ) {
    // Only when no violation already explains the hold: "AI not confident"
    // next to "AI found a violation" would tell the moderator the opposite of
    // what the AI said.
    reasons.add("ai_low_confidence");
  }
}

/** Assessed thumbnails first; see the file header's media section. */
export function decideMedia(input: {
  photoIds: readonly string[];
  unassessableIds: readonly string[];
  aiAssessed: boolean;
  imagesAssessed: number;
  /** The content is (or stays) visible after this decision. */
  released: boolean;
  /** No reason at all to doubt the assessed files. */
  clean: boolean;
  policy: PolicyFallbacks["unassessedMedia"];
}): MediaDecision {
  const covered = input.aiAssessed
    ? Math.max(0, Math.min(Math.floor(input.imagesAssessed) || 0, input.photoIds.length))
    : 0;
  const assessed = input.photoIds.slice(0, covered);
  const unassessed = [...input.photoIds.slice(covered), ...input.unassessableIds];

  if (!input.released) {
    // Held or hidden: every file waits for the moderator's decision on the
    // case. Flag media review only for files the AI genuinely could not see —
    // photos an outage kept from the AI are not "unassessable" and will be
    // assessed when the run is repeated.
    const unseen =
      input.unassessableIds.length > 0 || (input.aiAssessed && covered < input.photoIds.length);
    return {
      approveIds: [],
      pendingIds: [...input.photoIds, ...input.unassessableIds],
      mediaReview: input.policy === "review" && unseen,
    };
  }

  const approveIds = input.clean ? [...assessed] : [];
  const pendingIds = input.clean ? [] : [...assessed];
  if (input.policy === "publish" && input.clean) approveIds.push(...unassessed);
  else pendingIds.push(...unassessed);
  return { approveIds, pendingIds, mediaReview: pendingIds.length > 0 };
}

function commonFields(input: PolicyInput) {
  const assessment = input.ai.status === "assessed" ? input.ai.assessment : null;
  const safetyRisk =
    assessment && assessment.safetyRisk !== "none" ? assessment.safetyRisk : null;
  const highSeverityViolation = Boolean(
    assessment?.categories.some((verdict) => verdict.violation && verdict.severity === "high"),
  );
  const decidedBy: "ai" | "system" =
    input.ai.status === "assessed" || input.ai.status === "blocked" ? "ai" : "system";
  return { safetyRisk, highSeverityViolation, decidedBy };
}

function finish(
  input: PolicyInput,
  outcome: PolicyOutcome,
  reasons: Ordered<HoldReason>,
  categories: Ordered<PolicyCategory>,
  media: MediaDecision,
): PolicyDecision {
  const holdReasons = reasons.toArray();
  return {
    mode: input.mode,
    outcome,
    holdReasons,
    categories: categories.toArray(),
    media,
    aiFlagged: holdReasons.some((reason) => AI_SOURCED_REASONS.includes(reason)),
    keywordFlagged: holdReasons.includes("keyword_match"),
    ...commonFields(input),
  };
}

function imagesAssessedOf(ai: PolicyAi): number {
  return ai.status === "assessed" && ai.assessment ? ai.assessment.imagesAssessed : 0;
}

/**
 * Content mode — the §5.3 pseudocode for filed, edited, resubmitted, manual and
 * comment runs. Every applicable line adds a reason; no reasons → approve.
 */
function decideContent(input: PolicyInput): PolicyDecision {
  const reasons = new Ordered<HoldReason>();
  const categories = new Ordered<PolicyCategory>();
  const { ai, thresholds, fallbacks } = input;
  const down = aiDown(ai.status);

  if (!input.authorActive) reasons.add("author_banned");
  // D19: a resubmission after a human rejection always goes back to a human.
  // The AI still runs, so the moderator sees its view.
  if (input.trigger === "resubmitted") reasons.add("resubmission");
  if (!input.contentReadable) reasons.add("content_unreadable");
  // Review R10: never approve text the AI only saw part of.
  else if (input.contentTruncated) reasons.add("content_too_long");

  // D9: `hold` always holds; `signal` holds only when the AI confirms that
  // category or could not answer; `monitor` only records.
  for (const hit of input.keywordHits) {
    const confirmed =
      hit.action === "hold" ||
      (hit.action === "signal" &&
        (down || violatedAtLeast(ai, hit.category, thresholds.violationMinConfidence)));
    if (!confirmed) continue;
    reasons.add("keyword_match");
    categories.add(hit.category);
  }

  // D5: reports fail closed; keyword-clean comments approve (by default). The
  // comment fallback exists for outages only: a permanent engine error means the
  // model could not assess *this* text (it reliably hits MAX_TOKENS, RECITATION
  // or invalid JSON), which is exactly the text a human should see first, so it
  // holds whatever COMMENT_AI_FALLBACK says.
  if (down && input.contentReadable) {
    const fallback =
      input.targetType !== "comment"
        ? fallbacks.reportAiFallback
        : ai.status === "error"
          ? "hold"
          : fallbacks.commentAiFallback;
    if (fallback === "hold") reasons.add("ai_unavailable");
  }

  aiVerdictReasons(input, reasons, categories, { includeLowConfidence: true });

  const outcome: PolicyOutcome = reasons.size === 0 ? "approve" : "hold";
  const media = decideMedia({
    photoIds: input.media.photoIds,
    unassessableIds: input.media.unassessableIds,
    aiAssessed: ai.status === "assessed",
    imagesAssessed: imagesAssessedOf(ai),
    released: outcome === "approve",
    clean: outcome === "approve",
    policy: fallbacks.unassessedMedia,
  });
  return finish(input, outcome, reasons, categories, media);
}

/**
 * Evidence mode — files added to live content. Only the author's standing and
 * the AI's verdict on the new photos matter: keyword hits and resubmission are
 * about text that is already approved.
 *
 * Review R13: when the AI should have looked at photos and could not — an
 * outage, a permanent engine error, or the AI stage switched off — the photos
 * are held `ai_unavailable` with media review only for files the AI can never
 * see, so the case is outage-only (`isOutageOnlyCase`) and the reconciler
 * re-queues the evidence run once the engine is healthy. Before, the outage
 * was silent: every photo went to Media Review for good. A body that cannot be
 * opened is not an outage (a re-run cannot fix it) and is held
 * `content_unreadable` instead, so it never loops through the reconciler.
 */
function decideEvidence(input: PolicyInput): PolicyDecision {
  const reasons = new Ordered<HoldReason>();
  const categories = new Ordered<PolicyCategory>();
  const { ai, fallbacks } = input;
  const hasPhotos = input.media.photoIds.length > 0;
  const outage = hasPhotos && input.contentReadable && aiDown(ai.status);

  if (!input.authorActive) reasons.add("author_banned");
  if (hasPhotos && !input.contentReadable) reasons.add("content_unreadable");
  if (outage) reasons.add("ai_unavailable");
  if (hasPhotos) {
    aiVerdictReasons(input, reasons, categories, { includeLowConfidence: true });
  }

  const outcome: PolicyOutcome = reasons.size === 0 ? "approve" : "hold";
  const media = decideMedia({
    photoIds: input.media.photoIds,
    unassessableIds: input.media.unassessableIds,
    aiAssessed: ai.status === "assessed",
    imagesAssessed: imagesAssessedOf(ai),
    // An outage decides nothing about the photos: they wait for the re-run,
    // not for Media Review (`released: false` flags only the unseeable files).
    released: !outage,
    clean: reasons.size === 0,
    policy: fallbacks.unassessedMedia,
  });
  return finish(input, outcome, reasons, categories, media);
}

/**
 * Flag mode — D8. Hide only on a verbatim, high-confidence violation the
 * content itself contains, with no injection signal, no human approval of this
 * version and no earlier auto-hide of it. Everything else keeps the content up
 * and hands the moderator the AI's signals on the open case.
 */
function decideFlag(input: PolicyInput): PolicyDecision {
  const signals = new Ordered<HoldReason>();
  const categories = new Ordered<PolicyCategory>();
  const { ai, thresholds, fallbacks } = input;

  // Low confidence is not a signal worth a chip here: the case is already open
  // for the user flags, and "unsure" adds nothing a moderator can act on.
  aiVerdictReasons(input, signals, categories, { includeLowConfidence: false });

  const assessment = ai.status === "assessed" ? ai.assessment : null;
  const hideable =
    assessment && !assessment.injectionSuspected && !input.humanClearedCurrentVersion && !input.autoHiddenCurrentVersion
      ? assessment.categories.filter(
          (verdict) =>
            verdict.violation &&
            verdict.confidence >= thresholds.flagAutohideMinConfidence &&
            verbatimInContent(verdict.evidence, input.contentTexts),
        )
      : [];

  if (hideable.length > 0) {
    const reasons = new Ordered<HoldReason>();
    reasons.add("ai_violation");
    for (const reason of signals.toArray()) reasons.add(reason);
    const hideCategories = new Ordered<PolicyCategory>();
    for (const verdict of hideable) hideCategories.add(verdict.code);
    for (const code of categories.toArray()) hideCategories.add(code);
    const media = decideMedia({
      photoIds: input.media.photoIds,
      unassessableIds: input.media.unassessableIds,
      aiAssessed: true,
      imagesAssessed: imagesAssessedOf(ai),
      released: false,
      clean: false,
      policy: fallbacks.unassessedMedia,
    });
    return finish(input, "hide", reasons, hideCategories, media);
  }

  const media = decideMedia({
    photoIds: input.media.photoIds,
    unassessableIds: input.media.unassessableIds,
    aiAssessed: ai.status === "assessed",
    imagesAssessed: imagesAssessedOf(ai),
    released: true,
    clean: signals.size === 0,
    policy: fallbacks.unassessedMedia,
  });
  return finish(input, "keep", signals, categories, media);
}

/** §5.3 step 5: the decision for a guarded run. */
export function decide(input: PolicyInput): PolicyDecision {
  switch (input.mode) {
    case "flag":
      return decideFlag(input);
    case "evidence":
      return decideEvidence(input);
    case "content":
    default:
      return decideContent(input);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flag re-check input — D8, §7.9
// ─────────────────────────────────────────────────────────────────────────────

/** One open flag as a flag re-check reads it: its stored code and who raised it. */
export interface OpenFlagForRun {
  reason: string | null;
  /** Null when the reporter's account was erased — the flag stays a signal (§7.8). */
  reporterId: string | null;
  /** The reporter's `app_users.status`; null when unknown (erased or missing). */
  reporterStatus: string | null;
}

/**
 * D8: the *set* of categories a flag re-check tells the AI — never notes or
 * counts. Legacy codes are normalised; comment flags are limited to the six
 * comment categories; capped at the engine's limit.
 *
 * Review Q2 (§7.9 "their open flags stop triggering AI"): a flag whose
 * reporter's account exists and is not `active` — banned, suspended — does not
 * steer the AI. The ban dismisses the member's open flags as well; this covers
 * a run already claimed when the ban landed, and a status set by any other
 * path. An erased reporter (no account left) keeps their flag as a signal, as
 * account deletion intends.
 */
export function flaggedCategoriesFor(
  flags: readonly OpenFlagForRun[],
  targetType: ModerationTargetType,
): PolicyCategory[] {
  const categories = new Set<PolicyCategory>();
  for (const flag of flags) {
    if (flag.reporterId && flag.reporterStatus !== null && flag.reporterStatus !== "active") continue;
    const code = normaliseFlagCategory(flag.reason);
    if (!code) continue;
    if (targetType === "comment" && !COMMENT_FLAG_CATEGORIES.includes(code)) continue;
    categories.add(code);
  }
  return [...categories].slice(0, AI_LIMITS.maxFlaggedCategories);
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal path and reconciler predicates — §5.2, §5.4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run `error` values are prefixed by origin — `ai:<type>` for an engine
 * failure, `system:<type>` for anything else — so the terminal path can say
 * which it was without storing any content.
 */
export const AI_ERROR_PREFIX = "ai:";
export const SYSTEM_ERROR_PREFIX = "system:";

/**
 * §5.2: an exhausted run is held `ai_unavailable` if its last error was an AI
 * failure, `system_error` otherwise.
 */
export function terminalHoldReason(lastError: string | null | undefined): "ai_unavailable" | "system_error" {
  return typeof lastError === "string" && lastError.startsWith(AI_ERROR_PREFIX)
    ? "ai_unavailable"
    : "system_error";
}

/** The hold reasons an outage leaves behind (§5.2 reconciler). */
const OUTAGE_REASONS: readonly string[] = ["ai_unavailable", "system_error"];

/**
 * §5.2: the reconciler re-runs "open cases whose only hold reasons are
 * `ai_unavailable` / `system_error`, with no user flags". `media_unassessed` is
 * ignored in that test: it describes files the AI can never see, which a re-run
 * leaves exactly as they are (the re-run's approve re-opens a media-only case),
 * and counting it would exclude every outage hold on a report with a video.
 */
export function isOutageOnlyCase(holdReasons: readonly string[], userFlagCount: number): boolean {
  if (userFlagCount > 0) return false;
  const relevant = holdReasons.filter((reason) => reason !== "media_unassessed");
  return relevant.length > 0 && relevant.every((reason) => OUTAGE_REASONS.includes(reason));
}

/**
 * The trigger for a run the reconciler queues for a pending report that has
 * none (§5.2 "enqueue missed"). The row says nothing about *why* it is
 * pending, so this reads its history. D19 wins every tie: if the last run was a
 * resubmission check, or the last resolved case was a rejection, it is a
 * resubmission and must reach a human — a missed enqueue must never be the way
 * a rejected report gets AI-approved.
 */
export function reconcileTriggerFor(input: {
  lastTrigger: string | null;
  lastResolution: string | null;
  published: boolean;
}): RunTrigger {
  if (input.lastTrigger === "resubmitted" || input.lastResolution === "rejected") return "resubmitted";
  if (input.lastTrigger === "filed" || input.lastTrigger === "edited" || input.lastTrigger === "manual") {
    return input.lastTrigger;
  }
  return input.published ? "edited" : "filed";
}

// ─────────────────────────────────────────────────────────────────────────────
// The engine's answer, parsed — §6.1
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp01(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

const ENGINE_STATUSES = ["assessed", "unavailable", "blocked"] as const;

/** The engine caps `unavailableReason` at 64 characters (§6.1 extension, review R20). */
const MAX_UNAVAILABLE_REASON_CHARS = 64;

/**
 * The engine's answer as the pipeline reads it: the §6.1 assessment plus the
 * two fields review R20 added to the response. Kept here, not on
 * `AiAssessment`, because they are transport facts about an `unavailable`
 * answer, not part of the verdict the policy and the run row describe.
 */
export interface EngineAssessment extends AiAssessment {
  /**
   * False when the engine says the same request would fail the same way (a
   * provider 4xx, a RECITATION / LANGUAGE / MAX_TOKENS finish, unparseable
   * output despite the schema, Gemini unconfigured or not permitted). The
   * pipeline then records `ai_status = 'error'` — no retry, no breaker failure —
   * and the reconciler leaves it to a moderator's *Re-run AI*. Always true for
   * `assessed` and `blocked`, and when an older engine omits the field.
   */
  retryable: boolean;
  /** An operational code for an `unavailable` answer (`provider_http_400`, …); never content. */
  unavailableReason: string | null;
}
const SEVERITIES = ["low", "medium", "high"] as const;
const SAFETY_RISKS = ["none", "self_harm", "imminent_danger"] as const;

/**
 * Validate and normalise the engine's JSON into an `EngineAssessment`, or
 * `null` when it is unusable (which the pipeline treats as a retryable
 * failure, like the engine's own retryable `unavailable`).
 *
 * The engine already normalises (§6.1), but a cross-language contract with no
 * shared type checker is exactly where a silent drift would make the policy
 * decide on `undefined`. So: every category code must be a policy code (legacy
 * flag codes are mapped), confidences are clamped to 0–1, a missing category
 * counts as "no violation", an `approve` with a violated category is turned
 * into `review` (the engine's own invariant), and text fields are capped at the
 * contract's lengths.
 *
 * `retryable` / `unavailableReason` (review R20) are read only for an
 * `unavailable` answer. Backward compatible: an engine that predates them —
 * or sends anything but a literal `false` — is treated as retryable, exactly
 * as before. The reason is reduced to a code alphabet, because it ends up in
 * the run's `error` column, which must never carry content.
 */
export function parseAiAssessment(raw: unknown): EngineAssessment | null {
  if (!isRecord(raw)) return null;
  const status = raw.status;
  if (typeof status !== "string" || !(ENGINE_STATUSES as readonly string[]).includes(status)) return null;
  const engineStatus = status as AiAssessment["status"];

  const byCode = new Map<PolicyCategory, AiCategoryVerdict>();
  if (Array.isArray(raw.categories)) {
    for (const entry of raw.categories) {
      if (!isRecord(entry)) continue;
      const code = typeof entry.code === "string" ? normaliseFlagCategory(entry.code) : null;
      if (!code || !isPolicyCategory(code) || byCode.has(code)) continue;
      const severity =
        typeof entry.severity === "string" && (SEVERITIES as readonly string[]).includes(entry.severity)
          ? (entry.severity as AiCategoryVerdict["severity"])
          : "low";
      byCode.set(code, {
        code,
        violation: entry.violation === true,
        confidence: clamp01(entry.confidence) ?? 0,
        severity,
        evidence: optionalText(entry.evidence, 200),
        evidenceEnglish: optionalText(entry.evidenceEnglish, 200),
      });
    }
  } else if (engineStatus === "assessed") {
    return null;
  }

  const confidence = clamp01(raw.confidence);
  let recommendation: AiAssessment["recommendation"];
  if (raw.recommendation === "approve" || raw.recommendation === "review") {
    recommendation = raw.recommendation;
  } else if (engineStatus === "assessed") {
    return null;
  } else {
    recommendation = "review";
  }
  if (engineStatus === "assessed" && confidence === null) return null;

  const categories = POLICY_CATEGORIES.filter((code) => byCode.has(code)).map(
    (code) => byCode.get(code) as AiCategoryVerdict,
  );
  if (categories.some((verdict) => verdict.violation)) recommendation = "review";

  const safetyRisk =
    typeof raw.safetyRisk === "string" && (SAFETY_RISKS as readonly string[]).includes(raw.safetyRisk)
      ? (raw.safetyRisk as SafetyRisk)
      : "none";
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const imagesAssessed =
    typeof raw.imagesAssessed === "number" && Number.isFinite(raw.imagesAssessed)
      ? Math.max(0, Math.floor(raw.imagesAssessed))
      : 0;

  const unavailable = engineStatus === "unavailable";
  const reasonText = unavailable ? optionalText(raw.unavailableReason, MAX_UNAVAILABLE_REASON_CHARS) : null;

  return {
    status: engineStatus,
    recommendation,
    confidence: confidence ?? 0,
    categories,
    safetyRisk,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 600) : "",
    injectionSuspected: raw.injectionSuspected === true,
    blockReason: optionalText(raw.blockReason, 64),
    language: optionalText(raw.language, 16),
    imagesAssessed: engineStatus === "assessed" ? imagesAssessed : 0,
    retryable: unavailable ? raw.retryable !== false : true,
    unavailableReason: reasonText ? reasonText.replace(/[^A-Za-z0-9_.-]/g, "_") : null,
    meta: {
      runId: typeof meta.runId === "string" ? meta.runId.slice(0, 64) : "",
      model: typeof meta.model === "string" ? meta.model.slice(0, 64) : "",
      policyVersion: typeof meta.policyVersion === "string" ? meta.policyVersion.slice(0, 32) : "",
      durationMs:
        typeof meta.durationMs === "number" && Number.isFinite(meta.durationMs)
          ? Math.max(0, Math.round(meta.durationMs))
          : 0,
    },
  };
}
