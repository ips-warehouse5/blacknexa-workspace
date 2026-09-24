import { describe, expect, test } from "bun:test";
import {
  ALL_DISPLAY_STATUSES,
  COMMENT_FLAG_CATEGORIES,
  COMMENT_FLAG_OPTIONS,
  CRISIS_LINES,
  DISPLAY_STATUS_LABELS,
  HELD_COPY,
  MEMBER_FLAG_LABELS,
  POLICY_CATEGORIES,
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_POLL_WINDOW_MS,
  REPORT_FLAG_OPTIONS,
  SAFETY_HOLD_COPY,
  STILL_CHECKING_COPY,
  VAULT_CHIPS,
  audienceCopy,
  canResubmit,
  displayStatusForCard,
  displayStatusForView,
  displayStatusOf,
  dismissReasonLabel,
  evidenceReviewLabel,
  filingExplainer,
  flagOptionsFor,
  isAuthorVisibleModerationState,
  isDisplayStatus,
  isModerated,
  isSettling,
  normaliseFlagCategory,
  ownCommentStateLabel,
  ownerReasonLabel,
  ownerStatusCopy,
  receiptSteps,
  receiptSummary,
  urgentConsequence,
  vaultChipLabel,
  vaultCounts,
  visibleVaultChips,
} from "@/lib/report/moderation";

/** The §3.2 owner display table, row by row. */
const TABLE = [
  { moderationState: "pending", status: "submitted", expected: "checking", label: "Checking" },
  { moderationState: "pending", status: "verified", expected: "checking", label: "Checking" },
  { moderationState: "held", status: "submitted", expected: "with_moderator", label: "With a moderator" },
  { moderationState: "held", status: "under_review", expected: "with_moderator", label: "With a moderator" },
  { moderationState: "rejected", status: "submitted", expected: "not_published", label: "Not published" },
  { moderationState: "rejected", status: "dismissed", expected: "not_published", label: "Not published" },
  { moderationState: "deactivated", status: "verified", expected: "taken_down", label: "Taken down" },
  { moderationState: "deactivated", status: "submitted", expected: "taken_down", label: "Taken down" },
  { moderationState: "approved", status: "submitted", expected: "published", label: "Published" },
  { moderationState: "approved", status: "under_review", expected: "under_review", label: "Under review" },
  { moderationState: "approved", status: "verified", expected: "verified", label: "Verified" },
  { moderationState: "approved", status: "dismissed", expected: "dismissed", label: "Dismissed" },
];

describe("displayStatusOf — §3.2", () => {
  for (const row of TABLE) {
    test(`${row.moderationState} + ${row.status} → ${row.expected}`, () => {
      expect(
        displayStatusOf({
          moderationState: row.moderationState,
          status: row.status,
          visibility: "public",
        }),
      ).toBe(row.expected);
      expect(DISPLAY_STATUS_LABELS[row.expected]).toBe(row.label);
      expect(ownerStatusCopy(row.expected).label).toBe(row.label);
    });
  }

  test("private reports show Private instead of Published", () => {
    expect(
      displayStatusOf({ moderationState: "approved", status: "submitted", visibility: "private" }),
    ).toBe("private");
  });

  test("a private report further along the case axis shows that axis", () => {
    for (const status of ["under_review", "verified", "dismissed"]) {
      expect(
        displayStatusOf({ moderationState: "approved", status, visibility: "private" }),
      ).toBe(status);
    }
  });

  test("a private report staff took down still shows Taken down", () => {
    expect(
      displayStatusOf({ moderationState: "deactivated", status: "submitted", visibility: "private" }),
    ).toBe("taken_down");
  });

  test("the chip order matches the server's nine statuses", () => {
    expect(ALL_DISPLAY_STATUSES).toEqual([
      "checking",
      "with_moderator",
      "not_published",
      "published",
      "private",
      "under_review",
      "verified",
      "dismissed",
      "taken_down",
    ]);
    for (const status of ALL_DISPLAY_STATUSES) {
      expect(typeof DISPLAY_STATUS_LABELS[status]).toBe("string");
    }
  });
});

describe("isDisplayStatus", () => {
  test("accepts the nine statuses and nothing else", () => {
    for (const status of ALL_DISPLAY_STATUSES) expect(isDisplayStatus(status)).toBe(true);
    for (const raw of ["", "approved", "pending", "Published", undefined, null, 3]) {
      expect(isDisplayStatus(raw)).toBe(false);
    }
  });
});

describe("displayStatusForView — C9, D2", () => {
  test("the server's moderation.displayStatus wins", () => {
    expect(
      displayStatusForView({
        moderation: { state: "held", displayStatus: "with_moderator" },
        status: "verified",
        visibility: "public",
      }),
    ).toBe("with_moderator");
  });

  test("falls back to the state, then to approved", () => {
    expect(
      displayStatusForView({ moderation: { state: "pending" }, status: "submitted", visibility: "public" }),
    ).toBe("checking");
    expect(displayStatusForView({ status: "under_review", visibility: "public" })).toBe("under_review");
    expect(displayStatusForView({ moderation: null, status: "submitted", visibility: "private" })).toBe(
      "private",
    );
  });
});

describe("displayStatusForCard", () => {
  test("prefers the server's displayStatus", () => {
    expect(
      displayStatusForCard({
        displayStatus: "with_moderator",
        moderationState: "approved",
        status: "verified",
        verified: true,
        visibility: "public",
      }),
    ).toBe("with_moderator");
  });

  test("falls back to the fields it has", () => {
    expect(
      displayStatusForCard({ moderationState: "pending", status: "submitted", verified: false, visibility: "public" }),
    ).toBe("checking");
    expect(displayStatusForCard({ verified: true, visibility: "public" })).toBe("verified");
    expect(displayStatusForCard({ verified: false, visibility: "private" })).toBe("private");
  });
});

describe("ownerStatusCopy", () => {
  test("every status has a label, a tone, a title and a body", () => {
    for (const status of ALL_DISPLAY_STATUSES) {
      const copy = ownerStatusCopy(status);
      expect(copy.label.length).toBeGreaterThan(0);
      expect(["progress", "attention", "bad", "ok", "neutral", "muted"]).toContain(copy.tone);
      expect(copy.bannerTitle.length).toBeGreaterThan(0);
      expect(copy.bannerBody.length).toBeGreaterThan(0);
    }
  });

  test("tones follow the meaning of each status", () => {
    expect(ownerStatusCopy("checking").tone).toBe("progress");
    expect(ownerStatusCopy("with_moderator").tone).toBe("attention");
    expect(ownerStatusCopy("not_published").tone).toBe("bad");
    expect(ownerStatusCopy("taken_down").tone).toBe("bad");
    expect(ownerStatusCopy("published").tone).toBe("ok");
    expect(ownerStatusCopy("under_review").tone).toBe("attention");
    expect(ownerStatusCopy("verified").tone).toBe("ok");
    expect(ownerStatusCopy("dismissed").tone).toBe("muted");
    expect(ownerStatusCopy("private").tone).toBe("neutral");
  });

  test("the held banner uses the spec's words", () => {
    expect(HELD_COPY).toBe(
      "A moderator checks it before it's published — urgent reports within the hour.",
    );
    expect(ownerStatusCopy("with_moderator").bannerBody.startsWith(HELD_COPY)).toBe(true);
  });

  test("published never claims to be verified", () => {
    expect(ownerStatusCopy("published").bannerBody).toContain("does not verify");
  });

  test("the private variant never mentions the feed or the automated check as a promise", () => {
    for (const status of ["published", "private", "under_review", "dismissed", "taken_down"]) {
      const copy = ownerStatusCopy(status, { isPrivate: true });
      expect(copy.bannerBody).not.toContain("feed");
    }
    expect(ownerStatusCopy("published", { isPrivate: true }).label).toBe("Private");
    expect(ownerStatusCopy("private").bannerTitle).toBe("Saved privately");
    expect(ownerStatusCopy("private").bannerBody).toContain("never sent to the automated check");
  });

  test("public copy for a published case status mentions the feed", () => {
    expect(ownerStatusCopy("under_review").bannerBody).toContain("community feed");
    expect(ownerStatusCopy("dismissed").bannerBody).toContain("community feed");
  });
});

describe("reasons — §3.2, §3.3", () => {
  test("only rejected and deactivated reports carry an author-visible reason", () => {
    expect(isAuthorVisibleModerationState("rejected")).toBe(true);
    expect(isAuthorVisibleModerationState("deactivated")).toBe(true);
    for (const state of ["pending", "approved", "held"]) {
      expect(isAuthorVisibleModerationState(state)).toBe(false);
    }
  });

  test("the state names the catalogue", () => {
    expect(ownerReasonLabel("rejected", "misleading")).toBe(
      "Fabricated, joke or trolling (not a genuine account)",
    );
    expect(ownerReasonLabel("rejected", "private_info")).toBe("Exposes private details");
    expect(ownerReasonLabel("deactivated", "reporter_request")).toBe("Reporter requested removal");
    expect(ownerReasonLabel("deactivated", "legal")).toBe("Legal or safeguarding instruction");
  });

  test("hold reasons and cross-catalogue codes are never shown", () => {
    expect(ownerReasonLabel("held", "ai_violation")).toBeNull();
    expect(ownerReasonLabel("held", "threat")).toBeNull();
    expect(ownerReasonLabel("rejected", "reporter_request")).toBeNull();
    expect(ownerReasonLabel("deactivated", "spam")).toBeNull();
    expect(ownerReasonLabel("rejected", null)).toBeNull();
    expect(ownerReasonLabel("rejected", "toString")).toBeNull();
  });

  test("dismiss reasons", () => {
    expect(dismissReasonLabel("duplicate")).toBe("Duplicate of an existing incident");
    expect(dismissReasonLabel("nope")).toBeNull();
  });

  test("only a rejected report can be resubmitted", () => {
    expect(canResubmit({ state: "rejected" })).toBe(true);
    for (const state of ["pending", "approved", "held", "deactivated"]) {
      expect(canResubmit({ state })).toBe(false);
    }
    expect(canResubmit(null)).toBe(false);
    expect(canResubmit(undefined)).toBe(false);
  });

  test("resubmission is hidden once the server says none are left", () => {
    expect(canResubmit({ state: "rejected", resubmissionsLeft: 3 })).toBe(true);
    expect(canResubmit({ state: "rejected", resubmissionsLeft: 1 })).toBe(true);
    expect(canResubmit({ state: "rejected", resubmissionsLeft: 0 })).toBe(false);
    // Omitted or null (an older server): offered, and the 409 answers the fourth try.
    expect(canResubmit({ state: "rejected", resubmissionsLeft: null })).toBe(true);
  });
});

describe("receiptSteps — C9", () => {
  const states = (steps) => steps.map((step) => `${step.label}:${step.state}`);

  test("checking", () => {
    expect(states(receiptSteps("checking"))).toEqual([
      "Filed:done",
      "Checking:current",
      "Published:todo",
      "Verified:todo",
    ]);
  });

  test("held for a moderator", () => {
    expect(states(receiptSteps("with_moderator"))).toEqual([
      "Filed:done",
      "With a moderator:current",
      "Published:todo",
      "Verified:todo",
    ]);
  });

  test("not published stops at the check", () => {
    expect(states(receiptSteps("not_published"))).toEqual([
      "Filed:done",
      "Not published:stopped",
      "Published:todo",
      "Verified:todo",
    ]);
  });

  test("published", () => {
    expect(states(receiptSteps("published"))).toEqual([
      "Filed:done",
      "Checked:done",
      "Published:done",
      "Verified:todo",
    ]);
  });

  test("under review, verified, dismissed", () => {
    expect(states(receiptSteps("under_review"))[3]).toBe("Under review:current");
    expect(states(receiptSteps("verified"))).toEqual([
      "Filed:done",
      "Checked:done",
      "Published:done",
      "Verified:done",
    ]);
    expect(states(receiptSteps("dismissed"))[3]).toBe("Dismissed:stopped");
  });

  test("taken down stops at publication", () => {
    expect(states(receiptSteps("taken_down"))).toEqual([
      "Filed:done",
      "Checked:done",
      "Taken down:stopped",
      "Verified:todo",
    ]);
  });

  test("private: Filed → Saved privately", () => {
    expect(states(receiptSteps("private"))).toEqual(["Filed:done", "Saved privately:done"]);
    expect(states(receiptSteps("verified", { isPrivate: true }))).toEqual([
      "Filed:done",
      "Saved privately:done",
    ]);
    expect(states(receiptSteps("taken_down", { isPrivate: true }))).toEqual([
      "Filed:done",
      "Taken down:stopped",
    ]);
  });

  test("every status has a summary, and the held one is the spec's line", () => {
    for (const status of ALL_DISPLAY_STATUSES) {
      expect(receiptSummary(status).length).toBeGreaterThan(0);
    }
    expect(receiptSummary("with_moderator")).toBe(HELD_COPY);
    expect(receiptSummary("private")).toContain("never published");
    expect(receiptSummary("published", { isPrivate: true })).toContain("never published");
  });

  test("after the window, the still-checking line promises a notification", () => {
    expect(STILL_CHECKING_COPY).toContain("notification");
    expect(STILL_CHECKING_COPY).toContain("moderator");
  });

  test("polls every 3 s for up to 60 s, only while checking", () => {
    expect(RECEIPT_POLL_INTERVAL_MS).toBe(3000);
    expect(RECEIPT_POLL_WINDOW_MS).toBe(60000);
    expect(isSettling("checking")).toBe(true);
    for (const status of ALL_DISPLAY_STATUSES.filter((s) => s !== "checking")) {
      expect(isSettling(status)).toBe(false);
    }
    expect(isSettling(undefined)).toBe(false);
  });
});

describe("flag catalogue — §3.1", () => {
  test("eight report categories, in the server's order, with the member labels", () => {
    expect(POLICY_CATEGORIES).toEqual([
      "threat",
      "harassment",
      "hate",
      "private_info",
      "misleading",
      "spam",
      "graphic",
      "other",
    ]);
    expect(REPORT_FLAG_OPTIONS).toHaveLength(8);
    expect(REPORT_FLAG_OPTIONS.map((option) => option.label)).toEqual([
      "It threatens or encourages violence",
      "It harasses or bullies someone",
      "It attacks people for who they are",
      "It exposes someone's private details",
      "It's fake or trolling",
      "Spam or advertising",
      "Graphic or sexual content",
      "Something else",
    ]);
  });

  test("six comment categories — no misleading, no graphic", () => {
    expect(COMMENT_FLAG_CATEGORIES).toEqual([
      "threat",
      "harassment",
      "hate",
      "private_info",
      "spam",
      "other",
    ]);
    expect(COMMENT_FLAG_OPTIONS).toHaveLength(6);
    expect(COMMENT_FLAG_OPTIONS.map((option) => option.code)).not.toContain("misleading");
    expect(COMMENT_FLAG_OPTIONS.map((option) => option.code)).not.toContain("graphic");
    for (const option of COMMENT_FLAG_OPTIONS) {
      expect(option.label).toBe(MEMBER_FLAG_LABELS[option.code]);
    }
    expect(flagOptionsFor("comment")).toBe(COMMENT_FLAG_OPTIONS);
    expect(flagOptionsFor("report")).toBe(REPORT_FLAG_OPTIONS);
  });

  test("safety categories are threat, private details and graphic", () => {
    expect(REPORT_FLAG_OPTIONS.filter((option) => option.safety).map((option) => option.code)).toEqual([
      "threat",
      "private_info",
      "graphic",
    ]);
  });

  test("legacy codes normalise; unknown codes do not", () => {
    expect(normaliseFlagCategory("threatening")).toBe("threat");
    expect(normaliseFlagCategory("private_details")).toBe("private_info");
    expect(normaliseFlagCategory("untrue")).toBe("misleading");
    expect(normaliseFlagCategory(" Spam ")).toBe("spam");
    expect(normaliseFlagCategory("nonsense")).toBeNull();
    expect(normaliseFlagCategory(undefined)).toBeNull();
  });
});

describe("comments, evidence, safety copy", () => {
  test("own comment states", () => {
    expect(ownCommentStateLabel("pending")).toBe("Checking…");
    expect(ownCommentStateLabel("held")).toBe("Held for review");
    expect(ownCommentStateLabel("rejected")).toBe("Removed by a moderator");
    expect(ownCommentStateLabel("approved")).toBeNull();
    expect(ownCommentStateLabel(undefined)).toBeNull();
  });

  test("evidence review labels", () => {
    expect(evidenceReviewLabel({ pendingReview: true })).toBe("Awaiting review");
    expect(evidenceReviewLabel({})).toBeNull();
    expect(evidenceReviewLabel({ moderationState: "pending" }, { owner: true })).toBe("Awaiting review");
    expect(evidenceReviewLabel({ moderationState: "approved" }, { owner: true })).toBeNull();
    expect(evidenceReviewLabel({ moderationState: "rejected" }, { owner: true })).toContain("moderator");
  });

  test("the safety-hold copy is the server's, and the crisis lines have typed actions", () => {
    expect(SAFETY_HOLD_COPY.body).toBe(
      "If you or someone else is in danger right now, call your local emergency number. A moderator is looking at your report now.",
    );
    expect(CRISIS_LINES.map((line) => line.contact)).toEqual(["911", "988"]);
    for (const line of CRISIS_LINES) expect(["call", "text"]).toContain(line.action);
  });

  test("only private reports skip the automated check", () => {
    expect(isModerated("public")).toBe(true);
    expect(isModerated("trusted")).toBe(true);
    expect(isModerated("private")).toBe(false);
  });
});

describe("filing copy — C6, C7, C9 (§10)", () => {
  test("C6 prints both urgent positions, in the spec's words", () => {
    const copy = urgentConsequence("public");
    expect(copy).toBe(
      "On: checked right away, and a moderator looks at it within the hour. Off: most reports are checked and published within minutes; some wait for a moderator.",
    );
    expect(urgentConsequence("trusted")).toBe(copy);
    expect(urgentConsequence(undefined)).toBe(copy);
  });

  test("a private report's urgent card promises no check and no publication", () => {
    const copy = urgentConsequence("private");
    expect(copy.startsWith("On:")).toBe(true);
    expect(copy).toContain("Off:");
    expect(copy).not.toContain("checked right away");
    expect(copy).toContain("never published and never sent to the automated check");
  });

  test("C7 explains the automated check, then published or a moderator", () => {
    const copy = filingExplainer({ files: 4, visibility: "public" });
    expect(copy.startsWith("Your 4 files are sealed, then the report is filed.")).toBe(true);
    expect(copy).toContain("automated safety check");
    expect(copy).toContain("published within minutes");
    expect(copy).toContain("waits for a moderator");
    expect(copy).not.toContain("dispatch");
    expect(copy.endsWith("Nothing is sent to any outside organisation.")).toBe(true);
    expect(filingExplainer({ files: 1, visibility: "trusted" }).startsWith("Your file is sealed")).toBe(true);
    expect(filingExplainer({ files: 0, visibility: "public" }).startsWith("The report is filed.")).toBe(true);
  });

  test("C7's private variant never mentions the check as something that happens", () => {
    const copy = filingExplainer({ files: 2, visibility: "private" });
    expect(copy).toContain("saved privately");
    expect(copy).toContain("never sent to the automated check");
    expect(copy).not.toContain("published within minutes");
  });

  test("C9 says who can see it, and that a moderated report is seen once published", () => {
    expect(audienceCopy({ visibility: "public", anonymous: true })).toBe(
      "Anyone in the community feed, without your name or photo, once it is published. Moderators can still see who filed it.",
    );
    expect(audienceCopy({ visibility: "public", anonymous: false })).toContain("once it is published");
    expect(audienceCopy({ visibility: "trusted", anonymous: false })).toContain("Verified advocates only");
    expect(audienceCopy({ visibility: "private", anonymous: true })).toBe(
      "Only you. It still counts toward your own record.",
    );
    expect(audienceCopy({ visibility: null, anonymous: false })).toContain("visibility setting");
  });
});

describe("Vault chips — F1", () => {
  test("All, Drafts, then the nine statuses", () => {
    expect(VAULT_CHIPS).toHaveLength(11);
    expect(VAULT_CHIPS.slice(0, 2)).toEqual(["all", "drafts"]);
    expect(vaultChipLabel("all")).toBe("All");
    expect(vaultChipLabel("drafts")).toBe("Drafts");
    expect(vaultChipLabel("with_moderator")).toBe("With a moderator");
  });

  test("counts by status, with drafts in All", () => {
    const counts = vaultCounts(["published", "published", "checking", "dismissed"], 2);
    expect(counts.all).toBe(6);
    expect(counts.drafts).toBe(2);
    expect(counts.published).toBe(2);
    expect(counts.checking).toBe(1);
    expect(counts.dismissed).toBe(1);
    expect(counts.verified).toBe(0);
  });

  test("zero-count chips are hidden, except All and the selected chip", () => {
    const counts = vaultCounts(["verified"], 0);
    expect(visibleVaultChips(counts, "all")).toEqual(["all", "verified"]);
    expect(visibleVaultChips(counts, "taken_down")).toEqual(["all", "verified", "taken_down"]);
  });

  test("every chip shows when the counts are incomplete", () => {
    expect(visibleVaultChips(null, "all")).toEqual([...VAULT_CHIPS]);
  });
});
