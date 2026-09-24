/**
 * Unit tests for the shared moderation vocabulary — `npm test`.
 *
 * These run without a `.env` or a database: `moderation.interface.ts` imports
 * nothing, which is the property that makes it safe to share between the pure
 * policy module, the models and the clients' copies. If a future edit gives it
 * an import that reaches `env.config`, this file stops loading — deliberately.
 *
 * Covers docs/INCIDENT_MODULE_PLAN.md §3.1 (taxonomy and legacy flag codes),
 * §3.2 (the owner display table, every row), §3.3 (`other` needs a note),
 * §4.4 (case priority) and §5.2 (retry backoff bounds), plus the review fixes
 * that live here as pure rules: evidence approval scopes (R5), the D19
 * resubmission check and the late-evidence run plan (R1, R2), and the legacy
 * flag -> case summary (R16).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_TAB_LABELS,
  ALL_DISPLAY_STATUSES,
  BACKOFF,
  BAN_REASONS,
  COMMENT_FLAG_CATEGORIES,
  DEACTIVATE_REASONS,
  DISMISS_REASONS,
  DISPLAY_STATUS_LABELS,
  MEMBER_FLAG_LABELS,
  POLICY_CATEGORIES,
  REJECT_REASONS,
  backoffMs,
  casePriority,
  deactivateReasonLabel,
  displayStatusFilter,
  displayStatusOf,
  flagExpectedWithin,
  needsModeration,
  normaliseCommentFlagCategory,
  normaliseFlagCategory,
  ownerReasonLabel,
  rejectReasonLabel,
  requiresNote,
  RUN_PRIORITY,
  MAX_RESUBMISSIONS,
  isAwaitingResubmissionCheck,
  mergeApprovedScope,
  planLateEvidenceRun,
  resubmissionsLeft,
  summariseOpenFlags,
  type DisplayStatus,
  type OpenFlagRow,
  type ReportModerationState,
} from "./moderation.interface";

// ── Taxonomy (§3.1) ─────────────────────────────────────────────────────────

test("the eight policy categories are fixed, in order, and fully labelled", () => {
  assert.deepEqual(
    [...POLICY_CATEGORIES],
    ["threat", "harassment", "hate", "private_info", "misleading", "spam", "graphic", "other"],
  );
  for (const code of POLICY_CATEGORIES) {
    assert.ok(ADMIN_TAB_LABELS[code], `admin label for ${code}`);
    assert.ok(MEMBER_FLAG_LABELS[code], `member label for ${code}`);
  }
  assert.equal(ADMIN_TAB_LABELS.threat, "Direct Threat & Violence");
  assert.equal(MEMBER_FLAG_LABELS.misleading, "It's fake or trolling");
});

test("comments can be flagged under six categories, not misleading or graphic", () => {
  assert.deepEqual(
    [...COMMENT_FLAG_CATEGORIES],
    ["threat", "harassment", "hate", "private_info", "spam", "other"],
  );
});

test("normaliseFlagCategory accepts every canonical code unchanged", () => {
  for (const code of POLICY_CATEGORIES) {
    assert.equal(normaliseFlagCategory(code), code);
  }
});

test("normaliseFlagCategory maps the three legacy mobile codes", () => {
  assert.equal(normaliseFlagCategory("threatening"), "threat");
  assert.equal(normaliseFlagCategory("private_details"), "private_info");
  assert.equal(normaliseFlagCategory("untrue"), "misleading");
});

test("normaliseFlagCategory forgives case and whitespace, and refuses anything else", () => {
  assert.equal(normaliseFlagCategory("  Threatening "), "threat");
  assert.equal(normaliseFlagCategory("SPAM"), "spam");
  assert.equal(normaliseFlagCategory("violence"), null);
  assert.equal(normaliseFlagCategory(""), null);
  assert.equal(normaliseFlagCategory(null), null);
  assert.equal(normaliseFlagCategory(undefined), null);
  // Not fooled by Object.prototype keys.
  assert.equal(normaliseFlagCategory("constructor"), null);
  assert.equal(normaliseFlagCategory("toString"), null);
});

test("normaliseCommentFlagCategory only yields comment categories", () => {
  assert.equal(normaliseCommentFlagCategory("threatening"), "threat");
  assert.equal(normaliseCommentFlagCategory("private_details"), "private_info");
  assert.equal(normaliseCommentFlagCategory("untrue"), null);
  assert.equal(normaliseCommentFlagCategory("graphic"), null);
  assert.equal(normaliseCommentFlagCategory("spam"), "spam");
});

test("safety categories are promised within the hour", () => {
  assert.equal(flagExpectedWithin("threat"), "within the hour");
  assert.equal(flagExpectedWithin("private_info"), "within the hour");
  assert.equal(flagExpectedWithin("graphic"), "within the hour");
  assert.equal(flagExpectedWithin("spam"), "within a day");
});

test("needsModeration: private reports never reach the AI (D3)", () => {
  assert.equal(needsModeration({ visibility: "private" }), false);
  assert.equal(needsModeration({ visibility: "public" }), true);
  assert.equal(needsModeration({ visibility: "trusted" }), true);
});

// ── Owner display status (§3.2) ─────────────────────────────────────────────

const CASE_STATUSES = ["submitted", "under_review", "verified", "dismissed"] as const;

test("displayStatusOf: non-approved states win whatever the case status", () => {
  const rows: [ReportModerationState, DisplayStatus][] = [
    ["pending", "checking"],
    ["held", "with_moderator"],
    ["rejected", "not_published"],
    ["deactivated", "taken_down"],
  ];
  for (const [moderationState, expected] of rows) {
    for (const status of CASE_STATUSES) {
      for (const visibility of ["public", "trusted", "private"]) {
        assert.equal(
          displayStatusOf({ moderationState, status, visibility }),
          expected,
          `${moderationState} / ${status} / ${visibility}`,
        );
      }
    }
  }
});

test("displayStatusOf: approved reports show the case status", () => {
  const rows: [string, DisplayStatus][] = [
    ["submitted", "published"],
    ["under_review", "under_review"],
    ["verified", "verified"],
    ["dismissed", "dismissed"],
  ];
  for (const [status, expected] of rows) {
    assert.equal(displayStatusOf({ moderationState: "approved", status, visibility: "public" }), expected);
    assert.equal(displayStatusOf({ moderationState: "approved", status, visibility: "trusted" }), expected);
  }
});

test("displayStatusOf: private shows Private instead of Published, and only there", () => {
  assert.equal(
    displayStatusOf({ moderationState: "approved", status: "submitted", visibility: "private" }),
    "private",
  );
  assert.equal(
    displayStatusOf({ moderationState: "approved", status: "under_review", visibility: "private" }),
    "under_review",
  );
  assert.equal(
    displayStatusOf({ moderationState: "approved", status: "verified", visibility: "private" }),
    "verified",
  );
  assert.equal(
    displayStatusOf({ moderationState: "approved", status: "dismissed", visibility: "private" }),
    "dismissed",
  );
});

test("every display status has a label, and the §3.2 labels are exact", () => {
  for (const status of ALL_DISPLAY_STATUSES) {
    assert.ok(DISPLAY_STATUS_LABELS[status], status);
  }
  assert.equal(DISPLAY_STATUS_LABELS.checking, "Checking");
  assert.equal(DISPLAY_STATUS_LABELS.with_moderator, "With a moderator");
  assert.equal(DISPLAY_STATUS_LABELS.not_published, "Not published");
  assert.equal(DISPLAY_STATUS_LABELS.taken_down, "Taken down");
  assert.equal(DISPLAY_STATUS_LABELS.published, "Published");
  assert.equal(DISPLAY_STATUS_LABELS.private, "Private");
});

test("displayStatusFilter is the exact inverse of displayStatusOf", () => {
  for (const displayStatus of ALL_DISPLAY_STATUSES) {
    const filter = displayStatusFilter(displayStatus);
    const status = filter.statuses ? filter.statuses[0] : "submitted";
    const visibility = filter.visibility === "private" ? "private" : "public";
    assert.equal(
      displayStatusOf({ moderationState: filter.moderationState, status, visibility }),
      displayStatus,
      displayStatus,
    );
  }
});

// ── Reasons (§3.3) ──────────────────────────────────────────────────────────

test("requiresNote is true for 'other' only", () => {
  assert.equal(requiresNote("other"), true);
  for (const code of ["threat", "not_credible", "legal", "repeat", "", null, undefined]) {
    assert.equal(requiresNote(code), false, String(code));
  }
});

test("every reason catalogue ends with 'other', and codes are unique", () => {
  for (const catalogue of [REJECT_REASONS, DISMISS_REASONS, DEACTIVATE_REASONS, BAN_REASONS]) {
    assert.equal(catalogue[catalogue.length - 1]?.code, "other");
    const codes = catalogue.map((option) => option.code);
    assert.equal(new Set(codes).size, codes.length);
  }
  assert.deepEqual(
    REJECT_REASONS.map((option) => option.code),
    [...POLICY_CATEGORIES],
  );
});

test("reason labels resolve per catalogue, and owners never see hold reasons", () => {
  assert.equal(rejectReasonLabel("misleading"), "Fabricated, joke or trolling (not a genuine account)");
  assert.equal(deactivateReasonLabel("legal"), "Legal or safeguarding instruction");
  assert.equal(rejectReasonLabel("nope"), null);
  assert.equal(ownerReasonLabel("rejected", "spam"), "Spam or advertising");
  assert.equal(ownerReasonLabel("deactivated", "reporter_request"), "Reporter requested removal");
  assert.equal(ownerReasonLabel("held", "spam"), null);
  assert.equal(ownerReasonLabel("approved", "spam"), null);
});

// ── Case priority (§4.4) ────────────────────────────────────────────────────

const quiet = {
  urgent: false,
  safetyRisk: "none" as const,
  categories: [] as string[],
  highSeverityViolation: false,
  userFlagCount: 0,
};

test("casePriority: an empty case is 0", () => {
  assert.equal(casePriority(quiet), 0);
});

test("casePriority: urgent or a safety risk is 100, not 200", () => {
  assert.equal(casePriority({ ...quiet, urgent: true }), 100);
  assert.equal(casePriority({ ...quiet, safetyRisk: "self_harm" }), 100);
  assert.equal(casePriority({ ...quiet, safetyRisk: "imminent_danger", urgent: true }), 100);
  assert.equal(casePriority({ ...quiet, safetyRisk: null }), 0);
});

test("casePriority: +40 once for threat, private_info or graphic", () => {
  assert.equal(casePriority({ ...quiet, categories: ["threat"] }), 40);
  assert.equal(casePriority({ ...quiet, categories: ["private_info", "graphic", "threat"] }), 40);
  assert.equal(casePriority({ ...quiet, categories: ["spam", "hate"] }), 0);
});

test("casePriority: +20 for a high-severity violation, +5 per flag up to ten", () => {
  assert.equal(casePriority({ ...quiet, highSeverityViolation: true }), 20);
  assert.equal(casePriority({ ...quiet, userFlagCount: 3 }), 15);
  assert.equal(casePriority({ ...quiet, userFlagCount: 10 }), 50);
  assert.equal(casePriority({ ...quiet, userFlagCount: 250 }), 50);
  assert.equal(casePriority({ ...quiet, userFlagCount: -4 }), 0);
});

test("casePriority: the terms add up", () => {
  assert.equal(
    casePriority({
      urgent: true,
      safetyRisk: "none",
      categories: ["threat", "spam"],
      highSeverityViolation: true,
      userFlagCount: 4,
    }),
    100 + 40 + 20 + 20,
  );
});

test("casePriority: a media-only case gets 5, as a floor", () => {
  assert.equal(casePriority({ ...quiet, mediaOnly: true }), 5);
  assert.equal(casePriority({ ...quiet, mediaOnly: true, urgent: true }), 100);
});

// ── Backoff (§5.2) ──────────────────────────────────────────────────────────

test("backoffMs: 15 s, 60 s, 4 min, then capped at 10 min, without jitter", () => {
  const middle = (): number => 0.5;
  assert.equal(backoffMs(1, middle), 15_000);
  assert.equal(backoffMs(2, middle), 60_000);
  assert.equal(backoffMs(3, middle), 240_000);
  assert.equal(backoffMs(4, middle), 600_000);
  assert.equal(backoffMs(40, middle), 600_000);
  assert.equal(backoffMs(10_000, middle), 600_000);
});

test("backoffMs: jitter stays within ±20 %", () => {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const base = Math.min(BACKOFF.baseMs * 4 ** (attempt - 1), BACKOFF.capMs);
    assert.equal(backoffMs(attempt, () => 0), Math.round(base * 0.8));
    assert.equal(backoffMs(attempt, () => 0.999999), Math.round(base * (0.8 + 0.4 * 0.999999)));
    for (let i = 0; i < 200; i += 1) {
      const delay = backoffMs(attempt);
      assert.ok(delay >= base * 0.8 && delay <= base * 1.2, `attempt ${attempt}: ${delay}`);
    }
  }
});

test("backoffMs: nonsense input is treated as the first attempt", () => {
  const middle = (): number => 0.5;
  assert.equal(backoffMs(0, middle), 15_000);
  assert.equal(backoffMs(-3, middle), 15_000);
  assert.equal(backoffMs(Number.NaN, middle), 15_000);
  // A misbehaving random source is clamped rather than trusted.
  assert.equal(backoffMs(1, () => 7), 18_000);
  assert.equal(backoffMs(1, () => -1), 12_000);
});

// ── Evidence approval scope (D22, review R5) ────────────────────────────────

test("mergeApprovedScope: an approval never narrows, and a full assessment upgrades", () => {
  assert.equal(mergeApprovedScope(null, "thumbnail"), "thumbnail");
  assert.equal(mergeApprovedScope(undefined, "full"), "full");
  assert.equal(mergeApprovedScope("thumbnail", "full"), "full");
  // A later preview-only verdict must not take the original away again.
  assert.equal(mergeApprovedScope("full", "thumbnail"), "full");
  assert.equal(mergeApprovedScope("thumbnail", "thumbnail"), "thumbnail");
});

// ── D19 resubmission check and the late-evidence run (review R1, R2) ────────

const resubmitted = {
  resubmission_count: 1,
  moderation_state: "pending",
  approved_content_version: 1 as number | null,
};

test("isAwaitingResubmissionCheck: a resubmitted version not yet approved waits for a human", () => {
  assert.equal(isAwaitingResubmissionCheck(resubmitted, 2), true);
  assert.equal(isAwaitingResubmissionCheck({ ...resubmitted, moderation_state: "held" }, 2), true);
  assert.equal(isAwaitingResubmissionCheck({ ...resubmitted, approved_content_version: null }, 2), true);
  // Resubmitted before, but no run left to prove the check happened: a human.
  assert.equal(isAwaitingResubmissionCheck(resubmitted, null), true);
});

test("isAwaitingResubmissionCheck: false once approved, never rejected, or live", () => {
  assert.equal(isAwaitingResubmissionCheck({ ...resubmitted, approved_content_version: 2 }, 2), false);
  assert.equal(isAwaitingResubmissionCheck({ ...resubmitted, approved_content_version: 3 }, 2), false);
  // Never resubmitted and no `resubmitted` run: no human rejection is on record.
  assert.equal(isAwaitingResubmissionCheck({ ...resubmitted, resubmission_count: 0 }, null), false);
  for (const state of ["approved", "rejected", "deactivated"]) {
    assert.equal(isAwaitingResubmissionCheck({ ...resubmitted, moderation_state: state }, 2), false, state);
  }
});

test("review Q7: a rejection Reactivate sent back is owed its check with a resubmission count of 0", () => {
  // Rejected on first submission (or rejected and taken down while live —
  // Reactivate clears the approved version), deactivated, reactivated: the
  // reactivation queued a `resubmitted` run for v2, and nothing approved v2.
  const reactivated = { resubmission_count: 0, moderation_state: "held", approved_content_version: null };
  assert.equal(isAwaitingResubmissionCheck(reactivated, 2), true, "held by the reactivation run");
  assert.equal(isAwaitingResubmissionCheck({ ...reactivated, moderation_state: "pending" }, 2), true, "re-run → pending");
  // An approval of that version (only a human can give one while the debt holds) settles it.
  assert.equal(isAwaitingResubmissionCheck({ ...reactivated, approved_content_version: 2 }, 2), false);
  // …and an edit after that approval is an ordinary edit again.
  assert.equal(isAwaitingResubmissionCheck({ ...reactivated, approved_content_version: 3 }, 2), false);
});

test("resubmissionsLeft: counts down to 0 exactly where updateReport starts refusing (D19)", () => {
  assert.equal(MAX_RESUBMISSIONS, 3);
  assert.equal(resubmissionsLeft(0), 3);
  assert.equal(resubmissionsLeft(1), 2);
  assert.equal(resubmissionsLeft(2), 1);
  // `updateReport` refuses when resubmission_count >= MAX_RESUBMISSIONS.
  assert.equal(resubmissionsLeft(3), 0);
  assert.equal(resubmissionsLeft(7), 0, "never negative");
  // A missing or nonsense count is treated as none used, never as a refusal.
  assert.equal(resubmissionsLeft(null), 3);
  assert.equal(resubmissionsLeft(undefined), 3);
  assert.equal(resubmissionsLeft(Number.NaN), 3);
  assert.equal(resubmissionsLeft(-2), 3);
});

const lateFile = {
  moderated: true,
  reportState: "pending",
  fileState: "pending",
  urgent: false,
  queuedTrigger: null as string | null,
  awaitingResubmissionCheck: false,
};

test("R1: a photo added while the resubmission check is running queues a resubmitted run", () => {
  // The resubmitted run is `running` (so nothing is queued) and the check is owed.
  const plan = planLateEvidenceRun({ ...lateFile, awaitingResubmissionCheck: true });
  assert.equal(plan?.trigger, "resubmitted");
  // Without an owed check it is an ordinary evidence run.
  assert.equal(planLateEvidenceRun(lateFile)?.trigger, "evidence");
  // An approved report never takes the resubmission path — its check happened.
  assert.equal(
    planLateEvidenceRun({ ...lateFile, reportState: "approved", awaitingResubmissionCheck: true })?.trigger,
    "evidence",
  );
});

test("R2: an urgent report's late-evidence run keeps the urgent priority and short budget", () => {
  const urgent = planLateEvidenceRun({ ...lateFile, urgent: true });
  assert.equal(urgent?.priority, RUN_PRIORITY.urgent);
  assert.equal(urgent?.urgent, true);
  const ordinary = planLateEvidenceRun(lateFile);
  assert.equal(ordinary?.priority, RUN_PRIORITY.normal);
  assert.equal(ordinary?.urgent, false);
  const urgentApproved = planLateEvidenceRun({ ...lateFile, reportState: "approved", urgent: true });
  assert.equal(urgentApproved?.priority, RUN_PRIORITY.urgent);
});

test("planLateEvidenceRun: nothing to queue when another run covers the file, or none may", () => {
  // A pending report's queued run reads every pending file when it is claimed.
  assert.equal(planLateEvidenceRun({ ...lateFile, queuedTrigger: "resubmitted" }), null);
  assert.equal(planLateEvidenceRun({ ...lateFile, queuedTrigger: "evidence" }), null);
  // An approved report merges into a queued evidence run, never into another kind.
  assert.equal(
    planLateEvidenceRun({ ...lateFile, reportState: "approved", queuedTrigger: "evidence" })?.trigger,
    "evidence",
  );
  assert.equal(planLateEvidenceRun({ ...lateFile, reportState: "approved", queuedTrigger: "flagged" }), null);
  // Held and rejected reports wait for a moderator; private ones never reach the AI.
  assert.equal(planLateEvidenceRun({ ...lateFile, reportState: "held" }), null);
  assert.equal(planLateEvidenceRun({ ...lateFile, reportState: "rejected" }), null);
  assert.equal(planLateEvidenceRun({ ...lateFile, moderated: false }), null);
  assert.equal(planLateEvidenceRun({ ...lateFile, fileState: "approved" }), null);
});

// ── Legacy open flags -> cases (review R16) ─────────────────────────────────

const REPORT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const REPORT_B = "aaaaaaaa-0000-4000-8000-000000000002";
const COMMENT_C = "cccccccc-0000-4000-8000-000000000003";

function flagRow(overrides: Partial<OpenFlagRow>): OpenFlagRow {
  return { report_id: REPORT_A, comment_id: null, comment_report_id: null, reason: "spam", ...overrides };
}

test("summariseOpenFlags: one signal per target, counting its open flags", () => {
  const signals = summariseOpenFlags([
    flagRow({ reason: "threatening" }),
    flagRow({ reason: "spam" }),
    flagRow({ reason: "threat" }),
    flagRow({ report_id: REPORT_B, reason: "untrue" }),
  ]);
  assert.equal(signals.length, 2);
  const a = signals.find((s) => s.targetId === REPORT_A);
  assert.deepEqual(a, {
    targetType: "report",
    targetId: REPORT_A,
    reportId: REPORT_A,
    commentId: null,
    flagCount: 3,
    // Legacy codes normalised, first-seen order, deduplicated.
    categories: ["threat", "spam"],
  });
  assert.deepEqual(signals.find((s) => s.targetId === REPORT_B)?.categories, ["misleading"]);
});

test("summariseOpenFlags: a comment flag is the comment's, its report resolved through the comment", () => {
  const signals = summariseOpenFlags([
    // Legacy comment flags stored report_id NULL.
    flagRow({ report_id: null, comment_id: COMMENT_C, comment_report_id: REPORT_A, reason: "harassment" }),
    flagRow({ report_id: REPORT_A, comment_id: COMMENT_C, comment_report_id: REPORT_A, reason: "hate" }),
    // The report's own flag stays a separate target.
    flagRow({ reason: "spam" }),
  ]);
  assert.equal(signals.length, 2);
  const comment = signals.find((s) => s.targetType === "comment");
  assert.deepEqual(comment, {
    targetType: "comment",
    targetId: COMMENT_C,
    reportId: REPORT_A,
    commentId: COMMENT_C,
    flagCount: 2,
    categories: ["harassment", "hate"],
  });
  assert.equal(signals.find((s) => s.targetType === "report")?.flagCount, 1);
});

test("summariseOpenFlags: unknown reasons become other; unresolvable targets are skipped", () => {
  const signals = summariseOpenFlags([
    flagRow({ reason: "rude" }),
    flagRow({ reason: null }),
    // A comment that no longer exists has no report to hang a case on.
    flagRow({ report_id: null, comment_id: COMMENT_C, comment_report_id: null }),
    flagRow({ report_id: null }),
  ]);
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0].categories, ["other"]);
  assert.equal(signals[0].flagCount, 2);
});
