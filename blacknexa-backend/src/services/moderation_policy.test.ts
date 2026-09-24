/**
 * Unit tests for the moderation policy — `npm test`, no `.env`, no database.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.3: every row of the trigger × state guard
 * table (and the cancel conditions before it), every hold rule of the content
 * pseudocode, the D5 fallbacks, D8's auto-hide conditions one by one, the D22
 * media rules, evidence-mode semantics, and the terminal / reconciler
 * predicates and the engine-response parser.
 *
 * Review fixes pinned here: R9 (the injection prescreen holds whatever the AI
 * status), R10 (`content_too_long` — text the AI only saw part of is never
 * approved), R13 (an evidence-mode outage is an outage-only hold the
 * reconciler re-runs, not a permanent Media Review item), R17 (the verbatim
 * check covers every field the AI was shown), R20 (the engine's `retryable` /
 * `unavailableReason`, backward compatible), Q2 (a flag re-check ignores flags
 * whose reporter is no longer active), Q8 (nothing on a deactivated report is
 * decided by a run).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  blockCategory,
  decide,
  decideMedia,
  flaggedCategoriesFor,
  guardRun,
  isOutageOnlyCase,
  parseAiAssessment,
  reconcileTriggerFor,
  terminalHoldReason,
  type GuardInput,
  type PolicyInput,
} from "./moderation_policy";
import {
  HOLD_REASONS,
  POLICY_CATEGORIES,
  holdReasonLabel,
  type AiAssessment,
  type AiCategoryVerdict,
  type CommentModerationState,
  type KeywordHit,
  type PolicyCategory,
  type ReportModerationState,
  type RunTrigger,
} from "../types/moderation.interface";

// ── Builders ────────────────────────────────────────────────────────────────

type VerdictOverrides = Partial<Record<PolicyCategory, Partial<AiCategoryVerdict>>>;

function assessment(
  overrides: Partial<Omit<AiAssessment, "categories">> & { verdicts?: VerdictOverrides } = {},
): AiAssessment {
  const { verdicts = {}, ...rest } = overrides;
  const categories = POLICY_CATEGORIES.map((code) => ({
    code,
    violation: false,
    confidence: 0.02,
    severity: "low" as const,
    evidence: null,
    evidenceEnglish: null,
    ...verdicts[code],
  }));
  const anyViolation = categories.some((verdict) => verdict.violation);
  return {
    status: "assessed",
    recommendation: anyViolation ? "review" : "approve",
    confidence: 0.95,
    categories,
    safetyRisk: "none",
    summary: "summary",
    injectionSuspected: false,
    blockReason: null,
    language: "en",
    imagesAssessed: 0,
    meta: { runId: "a".repeat(32), model: "m", policyVersion: "p", durationMs: 5 },
    ...rest,
  };
}

function input(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    mode: "content",
    trigger: "filed",
    targetType: "report",
    authorActive: true,
    contentReadable: true,
    contentTruncated: false,
    keywordHits: [],
    ai: { status: "assessed", assessment: assessment() },
    media: { photoIds: [], unassessableIds: [] },
    contentTexts: ["Title", "Body text"],
    humanClearedCurrentVersion: false,
    autoHiddenCurrentVersion: false,
    thresholds: { autoApproveMinConfidence: 0.8, violationMinConfidence: 0.5, flagAutohideMinConfidence: 0.85 },
    fallbacks: { reportAiFallback: "hold", commentAiFallback: "approve", unassessedMedia: "review" },
    ...overrides,
  };
}

function hit(action: KeywordHit["action"], category: PolicyCategory = "threat", ruleId: string | null = "r1"): KeywordHit {
  return { ruleId, ruleName: "Rule", category, term: "term", field: "body", action };
}

function guard(overrides: Partial<GuardInput> & { state?: ReportModerationState } = {}): GuardInput {
  const { state = "pending", ...rest } = overrides;
  return {
    trigger: "filed",
    targetType: "report",
    runContentVersion: 1,
    report: { exists: true, deleted: false, visibility: "public", moderationState: state, contentVersion: 1 },
    comment: null,
    pendingEvidenceCount: 0,
    caseOpen: false,
    ...rest,
  };
}

const REPORT_STATES: ReportModerationState[] = ["pending", "approved", "held", "rejected", "deactivated"];
const COMMENT_STATES: CommentModerationState[] = ["pending", "approved", "held", "rejected"];

// ── Guard: cancel conditions (§5.3 step 1) ──────────────────────────────────

test("guard: a missing or deleted report, or a private target, cancels", () => {
  assert.deepEqual(guardRun(guard({ report: { exists: false, deleted: false, visibility: "public", moderationState: "pending", contentVersion: 1 } })), { ok: false, reason: "target_missing" });
  assert.deepEqual(guardRun(guard({ report: { exists: true, deleted: true, visibility: "public", moderationState: "pending", contentVersion: 1 } })), { ok: false, reason: "report_deleted" });
  assert.deepEqual(guardRun(guard({ report: { exists: true, deleted: false, visibility: "private", moderationState: "pending", contentVersion: 1 } })), { ok: false, reason: "private_target" });
  // Trusted is moderated like public.
  assert.deepEqual(guardRun(guard({ report: { exists: true, deleted: false, visibility: "trusted", moderationState: "pending", contentVersion: 1 } })), { ok: true, mode: "content" });
});

test("guard: a stale report run cancels; a newer or equal version proceeds", () => {
  assert.deepEqual(guardRun(guard({ runContentVersion: 1, report: { exists: true, deleted: false, visibility: "public", moderationState: "pending", contentVersion: 2 } })), { ok: false, reason: "stale_version" });
  assert.deepEqual(guardRun(guard({ runContentVersion: 2, report: { exists: true, deleted: false, visibility: "public", moderationState: "pending", contentVersion: 2 } })), { ok: true, mode: "content" });
});

test("guard: a missing, hidden or removed comment cancels; comments ignore content versions", () => {
  const base = { trigger: "comment" as RunTrigger, targetType: "comment" as const };
  assert.deepEqual(guardRun(guard({ ...base, comment: null })), { ok: false, reason: "target_missing" });
  assert.deepEqual(guardRun(guard({ ...base, comment: { exists: false, status: "visible", moderationState: "pending" } })), { ok: false, reason: "target_missing" });
  assert.deepEqual(guardRun(guard({ ...base, comment: { exists: true, status: "removed", moderationState: "pending" } })), { ok: false, reason: "comment_removed" });
  assert.deepEqual(guardRun(guard({ ...base, comment: { exists: true, status: "hidden", moderationState: "pending" } })), { ok: false, reason: "comment_removed" });
  // The parent report was edited since: irrelevant to a comment run.
  assert.deepEqual(
    guardRun(guard({ ...base, runContentVersion: 1, comment: { exists: true, status: "visible", moderationState: "pending" }, report: { exists: true, deleted: false, visibility: "public", moderationState: "approved", contentVersion: 5 } })),
    { ok: true, mode: "content" },
  );
});

test("guard: a comment on a private report is a private target", () => {
  assert.deepEqual(
    guardRun(guard({ trigger: "comment", targetType: "comment", comment: { exists: true, status: "visible", moderationState: "pending" }, report: { exists: true, deleted: false, visibility: "private", moderationState: "approved", contentVersion: 1 } })),
    { ok: false, reason: "private_target" },
  );
});

// ── Guard: the trigger × state table ────────────────────────────────────────

test("table row: filed · edited · resubmitted · manual apply only to a pending report (content)", () => {
  for (const trigger of ["filed", "edited", "resubmitted", "manual"] as RunTrigger[]) {
    for (const state of REPORT_STATES) {
      const result = guardRun(guard({ trigger, state }));
      if (state === "pending") assert.deepEqual(result, { ok: true, mode: "content" }, `${trigger}/${state}`);
      else assert.deepEqual(result, { ok: false, reason: "state_changed" }, `${trigger}/${state}`);
    }
  }
});

test("table row: comment applies only to a pending comment (content)", () => {
  for (const state of COMMENT_STATES) {
    const result = guardRun(guard({ trigger: "comment", targetType: "comment", comment: { exists: true, status: "visible", moderationState: state } }));
    if (state === "pending") assert.deepEqual(result, { ok: true, mode: "content" }, state);
    else assert.deepEqual(result, { ok: false, reason: "state_changed" }, state);
  }
  // `manual` on a comment (a re-run after a hold → pending) behaves the same.
  assert.deepEqual(guardRun(guard({ trigger: "manual", targetType: "comment", comment: { exists: true, status: "visible", moderationState: "pending" } })), { ok: true, mode: "content" });
});

test("table row: evidence applies to an approved report with pending sealed evidence (evidence mode)", () => {
  assert.deepEqual(guardRun(guard({ trigger: "evidence", state: "approved", pendingEvidenceCount: 2 })), { ok: true, mode: "evidence" });
  assert.deepEqual(guardRun(guard({ trigger: "evidence", state: "approved", pendingEvidenceCount: 0 })), { ok: false, reason: "nothing_pending" });
  for (const state of ["held", "rejected", "deactivated"] as ReportModerationState[]) {
    assert.deepEqual(guardRun(guard({ trigger: "evidence", state, pendingEvidenceCount: 1 })), { ok: false, reason: "state_changed" }, state);
  }
});

test("table extension: an evidence run on a pending report decides the report (content)", () => {
  // A queued filing/edit run absorbed an evidence commit in the enqueue merge.
  assert.deepEqual(guardRun(guard({ trigger: "evidence", state: "pending", pendingEvidenceCount: 1 })), { ok: true, mode: "content" });
  assert.deepEqual(guardRun(guard({ trigger: "evidence", state: "pending", pendingEvidenceCount: 0 })), { ok: true, mode: "content" });
});

test("table extension: an evidence run carrying an open flag case is a flag re-check", () => {
  assert.deepEqual(guardRun(guard({ trigger: "evidence", state: "approved", caseOpen: true, pendingEvidenceCount: 1 })), { ok: true, mode: "flag" });
});

test("table row: flagged applies to an approved target whose case is still open (flag mode)", () => {
  for (const state of REPORT_STATES) {
    const open = guardRun(guard({ trigger: "flagged", state, caseOpen: true }));
    const closed = guardRun(guard({ trigger: "flagged", state, caseOpen: false }));
    if (state === "approved") {
      assert.deepEqual(open, { ok: true, mode: "flag" });
      assert.deepEqual(closed, { ok: false, reason: "case_closed" });
    } else {
      assert.deepEqual(open, { ok: false, reason: "state_changed" }, state);
      assert.deepEqual(closed, { ok: false, reason: "state_changed" }, state);
    }
  }
  for (const state of COMMENT_STATES) {
    const result = guardRun(guard({ trigger: "flagged", targetType: "comment", caseOpen: true, comment: { exists: true, status: "visible", moderationState: state } }));
    if (state === "approved") assert.deepEqual(result, { ok: true, mode: "flag" });
    else assert.deepEqual(result, { ok: false, reason: "state_changed" }, state);
  }
  assert.deepEqual(guardRun(guard({ trigger: "flagged", targetType: "comment", caseOpen: false, comment: { exists: true, status: "visible", moderationState: "approved" } })), { ok: false, reason: "case_closed" });
});

test("table: content outcomes are approve/hold, flag outcomes hide/keep", () => {
  const content = decide(input());
  assert.ok(["approve", "hold"].includes(content.outcome));
  const flag = decide(input({ mode: "flag", trigger: "flagged" }));
  assert.ok(["hide", "keep"].includes(flag.outcome));
  const evidence = decide(input({ mode: "evidence", trigger: "evidence", media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.ok(["approve", "hold"].includes(evidence.outcome));
});

// ── Content mode: the hold rules (§5.3 pseudocode) ──────────────────────────

test("content: assessed and clean → approve, decided by the AI", () => {
  const decision = decide(input());
  assert.equal(decision.outcome, "approve");
  assert.deepEqual(decision.holdReasons, []);
  assert.equal(decision.decidedBy, "ai");
  assert.equal(decision.aiFlagged, false);
  assert.equal(decision.keywordFlagged, false);
});

test("hold rule: author not active → author_banned", () => {
  const decision = decide(input({ authorActive: false }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["author_banned"]);
});

test("hold rule: resubmitted → resubmission, even when the AI is clean (D19)", () => {
  const decision = decide(input({ trigger: "resubmitted" }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["resubmission"]);
  assert.equal(decision.decidedBy, "ai");
});

test("hold rule: body unreadable → content_unreadable (no ai_unavailable noise)", () => {
  const decision = decide(input({ contentReadable: false, ai: { status: "skipped", assessment: null } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["content_unreadable"]);
  assert.equal(decision.decidedBy, "system");
});

test("R10: text the AI saw only part of is held content_too_long, even on a clean confident verdict", () => {
  const report = decide(input({ contentTruncated: true }));
  assert.equal(report.outcome, "hold");
  assert.deepEqual(report.holdReasons, ["content_too_long"]);
  // The comment fallback (approve) cannot publish it either.
  const comment = decide(input({ targetType: "comment", trigger: "comment", contentTruncated: true, ai: { status: "unavailable", assessment: null } }));
  assert.equal(comment.outcome, "hold");
  assert.deepEqual(comment.holdReasons, ["content_too_long"]);
  // Unreadable already explains the hold; the two never stack.
  assert.deepEqual(decide(input({ contentReadable: false, contentTruncated: true, ai: { status: "skipped", assessment: null } })).holdReasons, ["content_unreadable"]);
  // The reason exists in the vocabulary and has a staff label.
  assert.ok(HOLD_REASONS.includes("content_too_long"));
  assert.ok(holdReasonLabel("content_too_long"));
  // It is not an outage: the reconciler must never re-run it on its own.
  assert.equal(isOutageOnlyCase(report.holdReasons, 0), false);
});

test("hold rule: a `hold` keyword hit always holds, whatever the AI says", () => {
  const decision = decide(input({ keywordHits: [hit("hold", "spam")] }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["keyword_match"]);
  assert.deepEqual(decision.categories, ["spam"]);
  assert.equal(decision.keywordFlagged, true);
});

test("hold rule: a `signal` hit does not hold when the AI assessed the category clean", () => {
  const decision = decide(input({ keywordHits: [hit("signal", "threat")] }));
  assert.equal(decision.outcome, "approve");
});

test("hold rule: a `signal` hit holds when the AI confirms that category ≥ VIOLATION_MIN", () => {
  const ai = assessment({ verdicts: { threat: { violation: true, confidence: 0.7, evidence: "x" } } });
  const decision = decide(input({ keywordHits: [hit("signal", "threat")], ai: { status: "assessed", assessment: ai } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["keyword_match", "ai_violation"]);
  assert.deepEqual(decision.categories, ["threat"]);
});

test("hold rule: a `signal` hit is not confirmed by a violation in another category", () => {
  const ai = assessment({ verdicts: { spam: { violation: true, confidence: 0.9 } } });
  const decision = decide(input({ keywordHits: [hit("signal", "threat")], ai: { status: "assessed", assessment: ai } }));
  assert.deepEqual(decision.holdReasons, ["ai_violation"]);
  assert.deepEqual(decision.categories, ["spam"]);
});

test("hold rule: a `signal` hit holds when the AI is unavailable, errored or skipped", () => {
  for (const status of ["unavailable", "error", "skipped"] as const) {
    const decision = decide(
      input({ targetType: "comment", trigger: "comment", keywordHits: [hit("signal", "private_info", null)], ai: { status, assessment: null } }),
    );
    assert.equal(decision.outcome, "hold", status);
    // A permanent error also holds on its own (the comment fallback covers outages only).
    assert.deepEqual(decision.holdReasons, status === "error" ? ["keyword_match", "ai_unavailable"] : ["keyword_match"], status);
    assert.equal(decision.decidedBy, "system");
  }
});

test("hold rule: a `monitor` hit never holds", () => {
  assert.equal(decide(input({ keywordHits: [hit("monitor")] })).outcome, "approve");
  assert.equal(decide(input({ keywordHits: [hit("monitor")], targetType: "comment", trigger: "comment", ai: { status: "unavailable", assessment: null } })).outcome, "approve");
});

test("hold rule (D5): AI unavailable/error/skipped holds a report `ai_unavailable`", () => {
  for (const status of ["unavailable", "error", "skipped"] as const) {
    const decision = decide(input({ ai: { status, assessment: null } }));
    assert.equal(decision.outcome, "hold", status);
    assert.deepEqual(decision.holdReasons, ["ai_unavailable"], status);
    assert.equal(decision.decidedBy, "system");
  }
});

test("hold rule (D5): REPORT_AI_FALLBACK=approve publishes a keyword-clean report (development only)", () => {
  const decision = decide(input({ ai: { status: "unavailable", assessment: null }, fallbacks: { reportAiFallback: "approve", commentAiFallback: "approve", unassessedMedia: "review" } }));
  assert.equal(decision.outcome, "approve");
  assert.equal(decision.decidedBy, "system");
});

test("hold rule (D5): a keyword-clean comment approves when the AI is down; COMMENT_FALLBACK=hold holds it", () => {
  const down = { status: "unavailable" as const, assessment: null };
  assert.equal(decide(input({ targetType: "comment", trigger: "comment", ai: down })).outcome, "approve");
  const held = decide(input({ targetType: "comment", trigger: "comment", ai: down, fallbacks: { reportAiFallback: "hold", commentAiFallback: "hold", unassessedMedia: "review" } }));
  assert.deepEqual(held.holdReasons, ["ai_unavailable"]);
});

test("hold rule (D5): a permanent AI error holds a comment whatever COMMENT_FALLBACK says", () => {
  const error = { status: "error" as const, assessment: null };
  const decision = decide(input({ targetType: "comment", trigger: "comment", ai: error }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["ai_unavailable"]);
  const devApprove = decide(input({ targetType: "comment", trigger: "comment", ai: error, fallbacks: { reportAiFallback: "approve", commentAiFallback: "approve", unassessedMedia: "review" } }));
  assert.equal(devApprove.outcome, "hold");
});

test("hold rule: AI blocked → ai_blocked, graphic for sexual reasons, other otherwise", () => {
  const blocked = (reason: string) =>
    decide(input({ ai: { status: "blocked", assessment: assessment({ status: "blocked", blockReason: reason, recommendation: "review", confidence: 0 }) } }));
  const sexual = blocked("PROHIBITED_CONTENT");
  assert.equal(sexual.outcome, "hold");
  assert.deepEqual(sexual.holdReasons, ["ai_blocked"]);
  assert.deepEqual(sexual.categories, ["graphic"]);
  assert.equal(sexual.aiFlagged, true);
  assert.equal(sexual.decidedBy, "ai");
  assert.deepEqual(blocked("SAFETY").categories, ["other"]);
  assert.equal(blockCategory("HARM_CATEGORY_SEXUALLY_EXPLICIT"), "graphic");
  assert.equal(blockCategory("IMAGE_SAFETY"), "graphic");
  assert.equal(blockCategory("BLOCKLIST"), "other");
  assert.equal(blockCategory(null), "other");
});

test("hold rule: injectionSuspected → injection_suspected (+ other)", () => {
  const decision = decide(input({ ai: { status: "assessed", assessment: assessment({ injectionSuspected: true }) } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["injection_suspected"]);
  assert.deepEqual(decision.categories, ["other"]);
});

test("R9: the prescreen's injection signal holds a comment even when the model was unavailable", () => {
  const body = assessment({ status: "unavailable", recommendation: "review", confidence: 0, injectionSuspected: true });
  // Before: the comment fallback (approve) published it.
  for (const status of ["unavailable", "error"] as const) {
    const decision = decide(input({ targetType: "comment", trigger: "comment", ai: { status, assessment: body } }));
    assert.equal(decision.outcome, "hold", status);
    assert.deepEqual(decision.holdReasons, status === "error" ? ["ai_unavailable", "injection_suspected"] : ["injection_suspected"], status);
    assert.deepEqual(decision.categories, ["other"], status);
    assert.equal(decision.aiFlagged, true, status);
  }
  // A report under the default fallback carries both reasons.
  assert.deepEqual(decide(input({ ai: { status: "unavailable", assessment: body } })).holdReasons, ["ai_unavailable", "injection_suspected"]);
  // Without the signal the comment fallback is unchanged.
  const clean = assessment({ status: "unavailable", recommendation: "review", confidence: 0 });
  assert.equal(decide(input({ targetType: "comment", trigger: "comment", ai: { status: "unavailable", assessment: clean } })).outcome, "approve");
});

test("R9: evidence and flag modes honour the injection signal whatever the AI status", () => {
  const body = assessment({ status: "unavailable", recommendation: "review", confidence: 0, injectionSuspected: true });
  const evidence = decide(input({ mode: "evidence", trigger: "evidence", ai: { status: "unavailable", assessment: body }, media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.ok(evidence.holdReasons.includes("injection_suspected"));
  assert.equal(evidence.outcome, "hold");
  const flag = decide(input({ mode: "flag", trigger: "flagged", ai: { status: "unavailable", assessment: body } }));
  assert.equal(flag.outcome, "keep");
  assert.deepEqual(flag.holdReasons, ["injection_suspected"]);
});

test("hold rule (D21): safetyRisk ≠ none → safety_risk", () => {
  for (const risk of ["self_harm", "imminent_danger"] as const) {
    const decision = decide(input({ ai: { status: "assessed", assessment: assessment({ safetyRisk: risk }) } }));
    assert.equal(decision.outcome, "hold");
    assert.deepEqual(decision.holdReasons, ["safety_risk"]);
    assert.equal(decision.safetyRisk, risk);
    assert.equal(decision.aiFlagged, true);
  }
});

test("hold rule: a violation ≥ VIOLATION_MIN → ai_violation with its categories; high severity is reported", () => {
  const ai = assessment({
    verdicts: {
      private_info: { violation: true, confidence: 0.5, severity: "high", evidence: "lives on Elm St" },
      spam: { violation: true, confidence: 0.49 },
    },
  });
  const decision = decide(input({ ai: { status: "assessed", assessment: ai } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["ai_violation"]);
  assert.deepEqual(decision.categories, ["private_info"]);
  assert.equal(decision.highSeverityViolation, true);
});

test("hold rule: recommendation review with no qualifying violation → ai_low_confidence", () => {
  const ai = assessment({ verdicts: { spam: { violation: true, confidence: 0.3 } } });
  assert.equal(ai.recommendation, "review");
  const decision = decide(input({ ai: { status: "assessed", assessment: ai } }));
  assert.deepEqual(decision.holdReasons, ["ai_low_confidence"]);
  assert.deepEqual(decision.categories, []);
});

test("hold rule: an approve below AUTO_APPROVE_MIN → ai_low_confidence; at the threshold it approves", () => {
  assert.deepEqual(decide(input({ ai: { status: "assessed", assessment: assessment({ confidence: 0.79 }) } })).holdReasons, ["ai_low_confidence"]);
  assert.equal(decide(input({ ai: { status: "assessed", assessment: assessment({ confidence: 0.8 }) } })).outcome, "approve");
});

test("hold rule: low confidence is not added next to a violation", () => {
  const ai = assessment({ confidence: 0.4, verdicts: { threat: { violation: true, confidence: 0.9 } } });
  assert.deepEqual(decide(input({ ai: { status: "assessed", assessment: ai } })).holdReasons, ["ai_violation"]);
});

test("hold rules accumulate in order", () => {
  const ai = assessment({ safetyRisk: "self_harm", injectionSuspected: true, verdicts: { threat: { violation: true, confidence: 0.9 } } });
  const decision = decide(input({ authorActive: false, trigger: "resubmitted", keywordHits: [hit("hold", "spam")], ai: { status: "assessed", assessment: ai } }));
  assert.deepEqual(decision.holdReasons, ["author_banned", "resubmission", "keyword_match", "injection_suspected", "safety_risk", "ai_violation"]);
  assert.deepEqual(decision.categories, ["spam", "other", "threat"]);
});

// ── Media (D22) ─────────────────────────────────────────────────────────────

test("media: an approved report approves the photos the AI assessed; the rest wait for a moderator", () => {
  const ai = assessment({ imagesAssessed: 2 });
  const decision = decide(input({ ai: { status: "assessed", assessment: ai }, media: { photoIds: ["p1", "p2", "p3"], unassessableIds: ["v1"] } }));
  assert.equal(decision.outcome, "approve");
  assert.deepEqual(decision.media.approveIds, ["p1", "p2"]);
  assert.deepEqual(decision.media.pendingIds, ["p3", "v1"]);
  assert.equal(decision.media.mediaReview, true);
});

test("media: all photos assessed and clean, nothing else → no media review", () => {
  const decision = decide(input({ ai: { status: "assessed", assessment: assessment({ imagesAssessed: 2 }) }, media: { photoIds: ["p1", "p2"], unassessableIds: [] } }));
  assert.deepEqual(decision.media, { approveIds: ["p1", "p2"], pendingIds: [], mediaReview: false });
});

test("media: MODERATION_UNASSESSED_MEDIA=publish approves unassessed files on a clean verdict", () => {
  const decision = decide(
    input({
      ai: { status: "assessed", assessment: assessment({ imagesAssessed: 1 }) },
      media: { photoIds: ["p1", "p2"], unassessableIds: ["v1"] },
      fallbacks: { reportAiFallback: "hold", commentAiFallback: "approve", unassessedMedia: "publish" },
    }),
  );
  assert.deepEqual(decision.media, { approveIds: ["p1", "p2", "v1"], pendingIds: [], mediaReview: false });
});

test("media: on a hold nothing is approved; only files the AI could never see flag media review", () => {
  const held = decide(input({ authorActive: false, ai: { status: "assessed", assessment: assessment({ imagesAssessed: 1 }) }, media: { photoIds: ["p1"], unassessableIds: ["v1"] } }));
  assert.equal(held.outcome, "hold");
  assert.deepEqual(held.media.approveIds, []);
  assert.deepEqual(held.media.pendingIds, ["p1", "v1"]);
  assert.equal(held.media.mediaReview, true);

  // An outage kept the photos from the AI: they are not "unassessable" — the
  // re-run will assess them — so no media review.
  const outage = decide(input({ ai: { status: "unavailable", assessment: null }, media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.equal(outage.outcome, "hold");
  assert.equal(outage.media.mediaReview, false);
});

test("media: a text approval without an assessment (fallback) leaves every photo for a moderator", () => {
  const decision = decide(
    input({
      ai: { status: "skipped", assessment: null },
      media: { photoIds: ["p1"], unassessableIds: [] },
      fallbacks: { reportAiFallback: "approve", commentAiFallback: "approve", unassessedMedia: "review" },
    }),
  );
  assert.equal(decision.outcome, "approve");
  assert.deepEqual(decision.media, { approveIds: [], pendingIds: ["p1"], mediaReview: true });
});

test("decideMedia clamps imagesAssessed to what was sent", () => {
  const media = decideMedia({ photoIds: ["p1"], unassessableIds: [], aiAssessed: true, imagesAssessed: 9, released: true, clean: true, policy: "review" });
  assert.deepEqual(media.approveIds, ["p1"]);
  const negative = decideMedia({ photoIds: ["p1"], unassessableIds: [], aiAssessed: true, imagesAssessed: -3, released: true, clean: true, policy: "review" });
  assert.deepEqual(negative.pendingIds, ["p1"]);
});

// ── Evidence mode ───────────────────────────────────────────────────────────

test("evidence mode: clean photos are approved; keyword hits and resubmission are ignored", () => {
  const decision = decide(
    input({
      mode: "evidence",
      trigger: "evidence",
      keywordHits: [hit("hold", "spam")],
      ai: { status: "assessed", assessment: assessment({ imagesAssessed: 1 }) },
      media: { photoIds: ["p1"], unassessableIds: [] },
    }),
  );
  assert.equal(decision.outcome, "approve");
  assert.deepEqual(decision.media.approveIds, ["p1"]);
  assert.equal(decision.keywordFlagged, false);
});

test("evidence mode: an AI violation keeps every new file pending for Media Review", () => {
  const ai = assessment({ imagesAssessed: 1, verdicts: { graphic: { violation: true, confidence: 0.9 } } });
  const decision = decide(input({ mode: "evidence", trigger: "evidence", ai: { status: "assessed", assessment: ai }, media: { photoIds: ["p1"], unassessableIds: ["d1"] } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["ai_violation"]);
  assert.deepEqual(decision.media.approveIds, []);
  assert.deepEqual(decision.media.pendingIds, ["p1", "d1"]);
  assert.equal(decision.media.mediaReview, true);
});

test("evidence mode: a banned author's files wait; videos alone wait for a moderator", () => {
  const banned = decide(input({ mode: "evidence", trigger: "evidence", authorActive: false, ai: { status: "assessed", assessment: assessment({ imagesAssessed: 1 }) }, media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.equal(banned.outcome, "hold");
  assert.deepEqual(banned.holdReasons, ["author_banned"]);
  const videoOnly = decide(input({ mode: "evidence", trigger: "evidence", ai: { status: "skipped", assessment: null }, media: { photoIds: [], unassessableIds: ["v1"] } }));
  assert.equal(videoOnly.outcome, "approve");
  assert.deepEqual(videoOnly.media, { approveIds: [], pendingIds: ["v1"], mediaReview: true });
});

test("R13: an evidence-mode outage holds the photos ai_unavailable — an outage-only case, not Media Review", () => {
  for (const status of ["unavailable", "error", "skipped"] as const) {
    const decision = decide(input({ mode: "evidence", trigger: "evidence", ai: { status, assessment: null }, media: { photoIds: ["p1", "p2"], unassessableIds: [] } }));
    assert.equal(decision.outcome, "hold", status);
    assert.deepEqual(decision.holdReasons, ["ai_unavailable"], status);
    // Nothing approved, nothing marked unassessable: the photos wait for the re-run.
    assert.deepEqual(decision.media, { approveIds: [], pendingIds: ["p1", "p2"], mediaReview: false }, status);
    assert.equal(isOutageOnlyCase(decision.holdReasons, 0), true, status);
  }
});

test("R13: an evidence outage flags media review only for files the AI can never see", () => {
  const decision = decide(input({ mode: "evidence", trigger: "evidence", ai: { status: "unavailable", assessment: null }, media: { photoIds: ["p1"], unassessableIds: ["v1"] } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.media, { approveIds: [], pendingIds: ["p1", "v1"], mediaReview: true });
  // The recorded reasons gain media_unassessed, which the outage test ignores.
  assert.equal(isOutageOnlyCase([...decision.holdReasons, "media_unassessed"], 0), true);
});

test("R13: an unreadable body is not an outage in evidence mode — it must not loop through the reconciler", () => {
  const decision = decide(input({ mode: "evidence", trigger: "evidence", contentReadable: false, ai: { status: "skipped", assessment: null }, media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.equal(decision.outcome, "hold");
  assert.deepEqual(decision.holdReasons, ["content_unreadable"]);
  assert.equal(isOutageOnlyCase(decision.holdReasons, 0), false);
});

// ── Flag mode (D8) ──────────────────────────────────────────────────────────

const FLAG_BODY = "They posted: we will find you tonight and make you pay.";

function flagInput(verdict: Partial<AiCategoryVerdict>, overrides: Partial<PolicyInput> = {}): PolicyInput {
  return input({
    mode: "flag",
    trigger: "flagged",
    contentTexts: ["A title", FLAG_BODY],
    ai: { status: "assessed", assessment: assessment({ verdicts: { threat: { violation: true, severity: "high", ...verdict } } }) },
    ...overrides,
  });
}

test("flag: a verbatim violation ≥ 0.85 with no injection, no human review, no earlier hide → hide", () => {
  const decision = decide(flagInput({ confidence: 0.9, evidence: "we will find you tonight" }));
  assert.equal(decision.outcome, "hide");
  assert.deepEqual(decision.holdReasons, ["ai_violation"]);
  assert.deepEqual(decision.categories, ["threat"]);
  assert.equal(decision.aiFlagged, true);
  assert.equal(decision.decidedBy, "ai");
});

test("flag: below AUTOHIDE_MIN → keep (with the violation as a signal)", () => {
  const decision = decide(flagInput({ confidence: 0.84, evidence: "we will find you tonight" }));
  assert.equal(decision.outcome, "keep");
  assert.deepEqual(decision.holdReasons, ["ai_violation"]);
});

test("flag: evidence not verbatim in the content → keep", () => {
  assert.equal(decide(flagInput({ confidence: 0.99, evidence: "I will find you" })).outcome, "keep");
  assert.equal(decide(flagInput({ confidence: 0.99, evidence: null })).outcome, "keep");
});

test("flag: injection suspected → keep", () => {
  const ai = assessment({ injectionSuspected: true, verdicts: { threat: { violation: true, confidence: 0.99, evidence: "we will find you tonight" } } });
  const decision = decide(input({ mode: "flag", trigger: "flagged", contentTexts: [FLAG_BODY], ai: { status: "assessed", assessment: ai } }));
  assert.equal(decision.outcome, "keep");
  assert.ok(decision.holdReasons.includes("injection_suspected"));
});

test("flag: a human approved this content version → keep", () => {
  assert.equal(decide(flagInput({ confidence: 0.99, evidence: "we will find you tonight" }, { humanClearedCurrentVersion: true })).outcome, "keep");
});

test("flag: this version was already auto-hidden once → keep", () => {
  assert.equal(decide(flagInput({ confidence: 0.99, evidence: "we will find you tonight" }, { autoHiddenCurrentVersion: true })).outcome, "keep");
});

test("flag: no assessment (unavailable, error, skipped) → keep, decided by the system", () => {
  for (const status of ["unavailable", "error", "skipped"] as const) {
    const decision = decide(input({ mode: "flag", trigger: "flagged", ai: { status, assessment: null } }));
    assert.equal(decision.outcome, "keep", status);
    assert.deepEqual(decision.holdReasons, []);
    assert.equal(decision.decidedBy, "system");
  }
});

test("flag: blocked → keep, but the case learns the AI declined", () => {
  const decision = decide(input({ mode: "flag", trigger: "flagged", ai: { status: "blocked", assessment: assessment({ status: "blocked", blockReason: "PROHIBITED_CONTENT" }) } }));
  assert.equal(decision.outcome, "keep");
  assert.deepEqual(decision.holdReasons, ["ai_blocked"]);
  assert.deepEqual(decision.categories, ["graphic"]);
});

test("flag: a safety risk is surfaced on keep", () => {
  const decision = decide(input({ mode: "flag", trigger: "flagged", ai: { status: "assessed", assessment: assessment({ safetyRisk: "imminent_danger" }) } }));
  assert.equal(decision.outcome, "keep");
  assert.equal(decision.safetyRisk, "imminent_danger");
  assert.deepEqual(decision.holdReasons, ["safety_risk"]);
});

test("flag: a clean keep approves pending photos the AI assessed; a hide approves nothing", () => {
  const keep = decide(input({ mode: "flag", trigger: "flagged", ai: { status: "assessed", assessment: assessment({ imagesAssessed: 1 }) }, media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.deepEqual(keep.media.approveIds, ["p1"]);
  const hide = decide(flagInput({ confidence: 0.9, evidence: "we will find you tonight" }, { media: { photoIds: ["p1"], unassessableIds: [] } }));
  assert.equal(hide.outcome, "hide");
  assert.deepEqual(hide.media.approveIds, []);
});

// ── Terminal path, reconciler, parser ───────────────────────────────────────

test("terminalHoldReason: an AI failure → ai_unavailable, anything else → system_error", () => {
  assert.equal(terminalHoldReason("ai:timeout"), "ai_unavailable");
  assert.equal(terminalHoldReason("ai:server_error_503"), "ai_unavailable");
  assert.equal(terminalHoldReason("system:SequelizeDatabaseError:55P03"), "system_error");
  assert.equal(terminalHoldReason(null), "system_error");
});

test("isOutageOnlyCase: only ai_unavailable/system_error (media aside), and no user flags", () => {
  assert.equal(isOutageOnlyCase(["ai_unavailable"], 0), true);
  assert.equal(isOutageOnlyCase(["system_error", "ai_unavailable"], 0), true);
  assert.equal(isOutageOnlyCase(["ai_unavailable", "media_unassessed"], 0), true);
  assert.equal(isOutageOnlyCase(["ai_unavailable"], 1), false);
  assert.equal(isOutageOnlyCase(["ai_unavailable", "keyword_match"], 0), false);
  assert.equal(isOutageOnlyCase(["media_unassessed"], 0), false);
  assert.equal(isOutageOnlyCase([], 0), false);
});

test("reconcileTriggerFor: a resubmission stays a resubmission (D19)", () => {
  assert.equal(reconcileTriggerFor({ lastTrigger: "resubmitted", lastResolution: null, published: false }), "resubmitted");
  assert.equal(reconcileTriggerFor({ lastTrigger: "edited", lastResolution: "rejected", published: true }), "resubmitted");
  assert.equal(reconcileTriggerFor({ lastTrigger: "edited", lastResolution: "approved", published: true }), "edited");
  assert.equal(reconcileTriggerFor({ lastTrigger: "flagged", lastResolution: null, published: true }), "edited");
  assert.equal(reconcileTriggerFor({ lastTrigger: null, lastResolution: null, published: false }), "filed");
  assert.equal(reconcileTriggerFor({ lastTrigger: "manual", lastResolution: null, published: true }), "manual");
});

test("parseAiAssessment: a valid response is normalised to eight categories in fixed order", () => {
  const parsed = parseAiAssessment({
    status: "assessed",
    recommendation: "approve",
    confidence: 1.4,
    categories: [
      { code: "spam", violation: false, confidence: 0.1, severity: "low", evidence: "" },
      { code: "threatening", violation: true, confidence: 0.9, severity: "high", evidence: "  quote  ", evidenceEnglish: null },
      { code: "nonsense", violation: true, confidence: 1 },
    ],
    safetyRisk: "self_harm",
    summary: "s",
    injectionSuspected: false,
    blockReason: null,
    language: "en",
    imagesAssessed: 2.7,
    meta: { runId: "r", model: "m", policyVersion: "p", durationMs: 12.4 },
  });
  assert.ok(parsed);
  assert.equal(parsed.confidence, 1);
  assert.deepEqual(parsed.categories.map((c) => c.code), ["threat", "spam"]);
  assert.equal(parsed.categories[0].evidence, "quote");
  assert.equal(parsed.categories[1].evidence, null);
  // A violation forces `review`, whatever the engine said.
  assert.equal(parsed.recommendation, "review");
  assert.equal(parsed.safetyRisk, "self_harm");
  assert.equal(parsed.imagesAssessed, 2);
  assert.equal(parsed.meta.durationMs, 12);
});

test("parseAiAssessment: unusable bodies are null (→ retryable)", () => {
  assert.equal(parseAiAssessment(null), null);
  assert.equal(parseAiAssessment("assessed"), null);
  assert.equal(parseAiAssessment({ status: "maybe" }), null);
  assert.equal(parseAiAssessment({ status: "assessed", recommendation: "approve", confidence: 0.9 }), null);
  assert.equal(parseAiAssessment({ status: "assessed", recommendation: "yes", confidence: 0.9, categories: [] }), null);
  assert.equal(parseAiAssessment({ status: "assessed", recommendation: "approve", confidence: "high", categories: [] }), null);
});

test("parseAiAssessment: unavailable and blocked answers parse leniently", () => {
  const unavailable = parseAiAssessment({ status: "unavailable" });
  assert.ok(unavailable);
  assert.equal(unavailable.recommendation, "review");
  assert.equal(unavailable.confidence, 0);
  assert.equal(unavailable.imagesAssessed, 0);
  const blocked = parseAiAssessment({ status: "blocked", recommendation: "review", confidence: 0, categories: [], blockReason: "SAFETY", imagesAssessed: 3 });
  assert.ok(blocked);
  assert.equal(blocked.blockReason, "SAFETY");
  assert.equal(blocked.imagesAssessed, 0);
});

test("R20: a non-retryable unavailable answer is read as permanent, with its reason code", () => {
  const permanent = parseAiAssessment({ status: "unavailable", retryable: false, unavailableReason: "provider_http_400" });
  assert.ok(permanent);
  assert.equal(permanent.retryable, false);
  assert.equal(permanent.unavailableReason, "provider_http_400");
  const outage = parseAiAssessment({ status: "unavailable", retryable: true, unavailableReason: "provider_timeout" });
  assert.ok(outage);
  assert.equal(outage.retryable, true);
});

test("R20: backward compatible — an engine without the fields, or with junk in them, reads as retryable", () => {
  for (const retryable of [undefined, null, "false", 0, "no"]) {
    const parsed = parseAiAssessment({ status: "unavailable", retryable });
    assert.ok(parsed);
    assert.equal(parsed.retryable, true, String(retryable));
    assert.equal(parsed.unavailableReason, null);
  }
});

test("R20: retryable is always true on a verdict, and the reason is a bounded code, never free text", () => {
  const assessed = parseAiAssessment({ ...assessment(), retryable: false, unavailableReason: "x" });
  assert.ok(assessed);
  assert.equal(assessed.retryable, true);
  assert.equal(assessed.unavailableReason, null);
  const blocked = parseAiAssessment({ status: "blocked", retryable: false, blockReason: "SAFETY" });
  assert.ok(blocked);
  assert.equal(blocked.retryable, true);
  const odd = parseAiAssessment({ status: "unavailable", retryable: false, unavailableReason: `finish_${"x".repeat(90)} he said "hi"` });
  assert.ok(odd);
  assert.ok((odd.unavailableReason ?? "").length <= 64);
  assert.match(odd.unavailableReason ?? "", /^[A-Za-z0-9_.-]+$/);
});

// ── Review Q8: a deactivated report has nothing left for a run to decide ─────

test("review Q8: every run on a deactivated report — comment runs included — is dropped", () => {
  const deactivated = { exists: true, deleted: false, visibility: "public", moderationState: "deactivated" as const, contentVersion: 1 };
  // A pending comment's own run (it used to go ahead: comments never looked at the parent).
  assert.deepEqual(
    guardRun(guard({ trigger: "comment", targetType: "comment", report: deactivated, comment: { exists: true, status: "visible", moderationState: "pending" } })),
    { ok: false, reason: "state_changed" },
  );
  // A flag re-check of an approved comment, even with its case still open.
  assert.deepEqual(
    guardRun(guard({ trigger: "flagged", targetType: "comment", caseOpen: true, report: deactivated, comment: { exists: true, status: "visible", moderationState: "approved" } })),
    { ok: false, reason: "state_changed" },
  );
  // Checked before the private branch: nothing is approved on a deactivated report either.
  assert.deepEqual(
    guardRun(guard({ trigger: "comment", targetType: "comment", report: { ...deactivated, visibility: "private" }, comment: { exists: true, status: "visible", moderationState: "pending" } })),
    { ok: false, reason: "state_changed" },
  );
  for (const trigger of ["filed", "edited", "resubmitted", "manual", "evidence", "flagged"] as RunTrigger[]) {
    assert.deepEqual(guardRun(guard({ trigger, report: deactivated, caseOpen: true, pendingEvidenceCount: 1 })), { ok: false, reason: "state_changed" }, trigger);
  }
  // A deleted report still says so first.
  assert.deepEqual(guardRun(guard({ report: { ...deactivated, deleted: true } })), { ok: false, reason: "report_deleted" });
});

// ── Review Q2: flags from members who are no longer active do not steer the AI ─

test("review Q2: flaggedCategoriesFor drops flags whose reporter is banned or suspended", () => {
  const flags = [
    { reason: "threat", reporterId: "m1", reporterStatus: "banned" },
    { reason: "harassment", reporterId: "m2", reporterStatus: "suspended" },
    { reason: "spam", reporterId: "m3", reporterStatus: "active" },
    // Erased reporter (severed, or the row is gone): the flag stays a signal.
    { reason: "private_details", reporterId: null, reporterStatus: null },
    { reason: "hate", reporterId: "m4", reporterStatus: null },
  ];
  assert.deepEqual(flaggedCategoriesFor(flags, "report"), ["spam", "private_info", "hate"]);
});

test("review Q2: flaggedCategoriesFor keeps D8's rules — the set, normalised, comment codes only, capped", () => {
  const active = (reason: string) => ({ reason, reporterId: "m", reporterStatus: "active" });
  assert.deepEqual(flaggedCategoriesFor([active("untrue"), active("untrue"), active("nonsense")], "report"), ["misleading"]);
  // `misleading` and `graphic` describe a report as a whole, not a comment.
  assert.deepEqual(flaggedCategoriesFor([active("misleading"), active("graphic"), active("spam")], "comment"), ["spam"]);
  assert.equal(flaggedCategoriesFor(POLICY_CATEGORIES.map(active), "report").length, 8);
  assert.deepEqual(flaggedCategoriesFor([], "report"), []);
});
