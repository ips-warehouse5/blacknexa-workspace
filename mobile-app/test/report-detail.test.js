import { describe, expect, test } from "bun:test";
import {
  EDIT_WARNING,
  RESUBMIT_COPY,
  SAFETY_FLAG_LINE,
  STILL_CHECKING_COPY,
} from "@/lib/report/moderation";
import {
  CASE_STATUS_LABELS,
  COMMENT_HELPER,
  COMMENT_MAX_CHARS,
  COMMENT_POLL_INTERVAL_MS,
  COMMENT_POLL_WINDOW_MS,
  NOTIFICATIONS_EMPTY_BODY,
  SAFETY_ROW_HINT,
  canShare,
  clampComment,
  commentActions,
  commentCounter,
  deleteReportCopy,
  editNotices,
  editSavedMessage,
  errorInfo,
  evidenceFrameImage,
  evidenceFrameNote,
  evidenceGridNotes,
  evidenceTile,
  findCommentState,
  flagErrorMessage,
  flagReceiptLine,
  flagSheetIntro,
  isResubmissionLimitError,
  notificationBodyLines,
  ownCommentTone,
  ownerBanner,
  ownerEditMode,
  ownerTimelineNodes,
  readErrorCopy,
  resubmissionCapReached,
  resubmissionLimitKey,
  shouldPollComment,
  shouldRetryRead,
  viewerStatusPills,
} from "@/lib/report/detail";

/** An `ApiError`-shaped value, as `lib/api/client.ts` throws it. */
function apiError(status, message, offline = false) {
  const err = new Error(message);
  err.status = status;
  err.offline = offline;
  return err;
}

/** An owner view with the fields these helpers read. */
function ownerView(state, overrides = {}) {
  return {
    caseRef: "BNX-4471",
    status: "submitted",
    visibility: "public",
    moderation: { state, ...(overrides.moderation ?? {}) },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "moderation")),
  };
}

describe("errors — reading a report", () => {
  test("errorInfo reads an ApiError and tolerates anything else", () => {
    expect(errorInfo(apiError(409, "Contact support."))).toEqual({
      status: 409,
      offline: false,
      message: "Contact support.",
    });
    expect(errorInfo(null)).toEqual({ status: null, offline: false, message: null });
    expect(errorInfo("boom")).toEqual({ status: null, offline: false, message: null });
    expect(errorInfo(apiError(0, "  ", true))).toEqual({ status: 0, offline: true, message: null });
  });

  test("a 4xx is never retried; a failure on our side is retried once", () => {
    expect(shouldRetryRead(0, apiError(404, "That report is not available."))).toBe(false);
    expect(shouldRetryRead(0, apiError(403, "No."))).toBe(false);
    expect(shouldRetryRead(0, apiError(503, "Down"))).toBe(true);
    expect(shouldRetryRead(1, apiError(503, "Down"))).toBe(false);
    expect(shouldRetryRead(0, new Error("network"))).toBe(true);
  });

  test("404 says not available — never 'not published yet' to a viewer", () => {
    const viewer = readErrorCopy(apiError(404, "That report is not available."));
    expect(viewer.title).toBe("That report is not available");
    expect(viewer.body).toBe("It may have been removed, or it may not be public.");
    expect(viewer.retry).toBe(false);
    expect(viewer.body.toLowerCase()).not.toContain("publish");
    expect(readErrorCopy(apiError(404, "x"), { owner: true }).body).toBe("It may have been deleted.");
  });

  test("anything else is I3's message with a retry", () => {
    const copy = readErrorCopy(apiError(500, "Internal"));
    expect(copy.title).toBe("Something went wrong on our end");
    expect(copy.body).toBe("This isn't you. Give it a moment and try again.");
    expect(copy.retry).toBe(true);
    expect(readErrorCopy(apiError(0, "x", true)).title).toBe("You're offline");
  });
});

describe("D1 — what a viewer is shown", () => {
  test("never an Under review or Dismissed pill", () => {
    for (const status of ["submitted", "under_review", "dismissed"]) {
      expect(viewerStatusPills({ urgent: false, status })).toEqual([]);
    }
    expect(viewerStatusPills({ urgent: true, status: "under_review" })).toEqual(["urgent"]);
    expect(viewerStatusPills({ urgent: true, status: "verified" })).toEqual(["urgent", "verified"]);
  });

  test("share is offered only where the server will answer with a link", () => {
    expect(canShare({ visibility: "public", isOwner: false })).toBe(true);
    expect(canShare({ visibility: "trusted", isOwner: false })).toBe(false);
    expect(canShare({ visibility: "private", isOwner: true, moderation: { state: "approved" } })).toBe(false);
    expect(canShare({ visibility: "public", isOwner: true, moderation: { state: "approved" } })).toBe(true);
    expect(canShare({ visibility: "trusted", isOwner: true, moderation: { state: "approved" } })).toBe(true);
    for (const state of ["pending", "held", "rejected", "deactivated"]) {
      expect(canShare({ visibility: "public", isOwner: true, moderation: { state } })).toBe(false);
    }
    // An older server with no moderation block: the report was live at filing.
    expect(canShare({ visibility: "public", isOwner: true })).toBe(true);
  });
});

describe("evidence tiles — D22, §7.3, §11a", () => {
  const approved = { kind: "photo", url: "https://f/1", thumbUrl: "https://t/1" };
  const awaiting = { kind: "video", url: null, thumbUrl: null, pendingReview: true };
  const preview = { kind: "photo", url: null, thumbUrl: "https://t/2", fullResolutionPending: true };

  test("a file awaiting review has no image and nothing to open", () => {
    expect(evidenceTile(awaiting)).toEqual({
      state: "awaiting",
      image: null,
      openable: false,
      badge: "Awaiting review",
    });
  });

  test("a preview-only photo shows its thumbnail, marked Preview", () => {
    expect(evidenceTile(preview)).toEqual({
      state: "preview",
      image: "https://t/2",
      openable: true,
      badge: "Preview",
    });
    expect(evidenceFrameImage(preview)).toBe("https://t/2");
    expect(evidenceFrameNote(preview)).toBe("You're seeing a preview. The full image is awaiting review.");
  });

  test("an approved file is an ordinary tile", () => {
    expect(evidenceTile(approved)).toEqual({ state: "open", image: "https://t/1", openable: true, badge: null });
    expect(evidenceFrameImage(approved)).toBe("https://f/1");
    expect(evidenceFrameNote(approved)).toBeNull();
  });

  test("the lightbox draws nothing for a file awaiting review, and says why", () => {
    expect(evidenceFrameImage(awaiting)).toBeNull();
    expect(evidenceFrameNote(awaiting)).toContain("Awaiting review");
  });

  test("the owner's own files always open, badged with their state", () => {
    const pending = { ...approved, moderationState: "pending" };
    const rejected = { ...approved, moderationState: "rejected" };
    expect(evidenceTile(pending, { owner: true })).toMatchObject({
      state: "owner_pending",
      openable: true,
      badge: "Awaiting review",
    });
    expect(evidenceTile(rejected, { owner: true })).toMatchObject({
      state: "owner_hidden",
      openable: true,
      badge: "Hidden",
    });
    expect(evidenceTile({ ...approved, moderationState: "approved" }, { owner: true }).badge).toBeNull();
    expect(evidenceFrameNote(pending, { owner: true })).toBe(
      "Only you can see this file until a moderator clears it.",
    );
  });

  test("one note per kind of badge on the grid, none for ordinary files", () => {
    expect(evidenceGridNotes([approved])).toEqual([]);
    expect(evidenceGridNotes([approved, awaiting, awaiting, preview])).toEqual([
      "Files marked Awaiting review appear once a moderator clears them.",
      "Photos marked Preview show a smaller copy — the full image is awaiting review.",
    ]);
    expect(
      evidenceGridNotes(
        [
          { ...approved, moderationState: "pending" },
          { ...approved, moderationState: "rejected" },
        ],
        { owner: true },
      ),
    ).toHaveLength(2);
  });
});

describe("D2 — the owner's timeline (§7.4)", () => {
  const timeline = [
    { status: "submitted", at: "2026-08-13T21:41:00.000Z", actorLabel: null, note: null },
    {
      status: "under_review",
      at: "2026-08-14T08:05:00.000Z",
      actorLabel: null,
      note: "Edited by the author",
    },
  ];
  const moderationTimeline = [
    {
      status: "submitted",
      at: "2026-08-13T21:41:00.000Z",
      actorLabel: null,
      note: null,
      moderationEvent: "published",
    },
    {
      status: "under_review",
      at: "2026-08-14T09:00:00.000Z",
      actorLabel: "by a moderator",
      note: null,
      moderationEvent: "not_published",
      reasonLabel: "Harassment",
    },
  ];

  test("merges both lists by time, the status event first on a tie", () => {
    const nodes = ownerTimelineNodes(timeline, moderationTimeline);
    expect(nodes.map((node) => node.label)).toEqual([
      "Submitted",
      "Published",
      "Under review",
      "Not published",
    ]);
    expect(nodes.map((node) => node.source)).toEqual(["status", "moderation", "status", "moderation"]);
  });

  test("carries the author-visible note, reason and actor", () => {
    const nodes = ownerTimelineNodes(timeline, moderationTimeline);
    expect(nodes[2].note).toBe("Edited by the author");
    expect(nodes[3].reasonLabel).toBe("Harassment");
    expect(nodes[3].actorLabel).toBe("by a moderator");
    expect(nodes[3].tone).toBe("bad");
  });

  test("only the last node is current", () => {
    const nodes = ownerTimelineNodes(timeline, moderationTimeline);
    expect(nodes.map((node) => node.current)).toEqual([false, false, false, true]);
    expect(ownerTimelineNodes([], [])).toEqual([]);
  });

  test("a report being checked ends in a Checking node, from when the check began", () => {
    const nodes = ownerTimelineNodes(timeline.slice(0, 1), moderationTimeline.slice(0, 1), {
      displayStatus: "checking",
      at: "2026-08-15T10:00:00.000Z",
    });
    expect(nodes.map((node) => node.label)).toEqual(["Submitted", "Published", "Checking"]);
    expect(nodes.map((node) => node.current)).toEqual([false, false, true]);
    expect(nodes[2]).toMatchObject({ tone: "progress", at: "2026-08-15T10:00:00.000Z" });
    // Any other state is already its own last event.
    expect(
      ownerTimelineNodes(timeline, moderationTimeline, { displayStatus: "not_published", at: null }).map(
        (node) => node.label,
      ),
    ).toEqual(["Submitted", "Published", "Under review", "Not published"]);
    // A just-filed report: Submitted, then Checking.
    expect(
      ownerTimelineNodes(timeline.slice(0, 1), [], { displayStatus: "checking", at: null }).map((n) => [
        n.label,
        n.at,
      ]),
    ).toEqual([
      ["Submitted", "2026-08-13T21:41:00.000Z"],
      ["Checking", "2026-08-13T21:41:00.000Z"],
    ]);
  });

  test("works with the case timeline alone, and keeps keys unique", () => {
    const nodes = ownerTimelineNodes(timeline);
    expect(nodes.map((node) => node.label)).toEqual(["Submitted", "Under review"]);
    const merged = ownerTimelineNodes(timeline, moderationTimeline);
    expect(new Set(merged.map((node) => node.key)).size).toBe(merged.length);
  });

  test("a timestamp that does not parse stays at the end, in order", () => {
    const nodes = ownerTimelineNodes(
      [
        { status: "dismissed", at: "not a date", actorLabel: null, note: null, reasonLabel: "Duplicate of an existing incident" },
        { status: "submitted", at: "2026-08-13T21:41:00.000Z", actorLabel: null, note: null },
      ],
      [],
    );
    expect(nodes.map((node) => node.label)).toEqual(["Submitted", "Dismissed"]);
    expect(nodes[1].reasonLabel).toBe("Duplicate of an existing incident");
    expect(nodes[1].tone).toBe("muted");
  });

  test("labels every case status and every moderation event", () => {
    expect(CASE_STATUS_LABELS.verified).toBe("Verified");
    const events = ["published", "with_moderator", "not_published", "taken_down", "live_again"];
    const nodes = ownerTimelineNodes(
      [],
      events.map((moderationEvent, index) => ({
        status: "submitted",
        at: `2026-08-1${index}T10:00:00.000Z`,
        actorLabel: null,
        note: null,
        moderationEvent,
      })),
    );
    expect(nodes.map((node) => node.label)).toEqual([
      "Published",
      "With a moderator",
      "Not published",
      "Taken down",
      "Live again",
    ]);
  });
});

describe("D2 — the banner (§10 'D2 owner')", () => {
  test("no banner while the report is simply live", () => {
    for (const status of ["submitted", "under_review", "verified", "dismissed"]) {
      expect(ownerBanner(ownerView("approved", { status }))).toBeNull();
    }
    expect(ownerBanner(ownerView("approved", { visibility: "private" }))).toBeNull();
  });

  test("checking, and the still-checking promise after the window", () => {
    const banner = ownerBanner(ownerView("pending"));
    expect(banner.displayStatus).toBe("checking");
    expect(banner.title).toBe("Checking your report");
    expect(banner.action).toBeNull();
    expect(ownerBanner(ownerView("pending"), { stillChecking: true }).body).toBe(STILL_CHECKING_COPY);
  });

  test("a held report shows no reason — hold reasons are staff-only", () => {
    const banner = ownerBanner(
      ownerView("held", { moderation: { reasonCode: "threat", reasonLabel: "Threatening content", note: "x" } }),
    );
    expect(banner.displayStatus).toBe("with_moderator");
    expect(banner.reasonLabel).toBeNull();
    expect(banner.note).toBeNull();
    expect(banner.action).toBeNull();
  });

  test("not published: reason, note and Edit and resubmit", () => {
    const banner = ownerBanner(
      ownerView("rejected", {
        moderation: { reasonCode: "private_info", reasonLabel: "Exposes private details", note: "Remove the address." },
      }),
    );
    expect(banner.title).toBe("Not published");
    expect(banner.reasonLabel).toBe("Exposes private details");
    expect(banner.note).toBe("Remove the address.");
    expect(banner.action).toBe("resubmit");
    expect(banner.actionHint).toBe(RESUBMIT_COPY.consequence);
  });

  test("the reason falls back to the code when the label is missing", () => {
    const banner = ownerBanner(ownerView("rejected", { moderation: { reasonCode: "spam" } }));
    expect(banner.reasonLabel).toBe("Spam or advertising");
  });

  test("once the limit is known, Contact support replaces the resubmit", () => {
    const banner = ownerBanner(ownerView("rejected"), { resubmissionLimitReached: true });
    expect(banner.action).toBe("contact_support");
    expect(banner.actionHint).toContain("BNX-4471");
    expect(ownerEditMode(ownerView("rejected"), { resubmissionLimitReached: true })).toBe("none");
    expect(ownerEditMode(ownerView("rejected"))).toBe("resubmit");
  });

  test("the view's resubmissionsLeft hides the resubmit before any refusal (§10)", () => {
    const usedUp = ownerView("rejected", { moderation: { resubmissionsLeft: 0 } });
    expect(resubmissionCapReached(usedUp)).toBe(true);
    expect(ownerBanner(usedUp).action).toBe("contact_support");
    expect(ownerEditMode(usedUp)).toBe("none");

    const oneLeft = ownerView("rejected", { moderation: { resubmissionsLeft: 1 } });
    expect(resubmissionCapReached(oneLeft)).toBe(false);
    expect(ownerBanner(oneLeft).action).toBe("resubmit");
    expect(ownerEditMode(oneLeft)).toBe("resubmit");

    // An older server omits the field: only a learned refusal counts.
    expect(resubmissionCapReached(ownerView("rejected"))).toBe(false);
    expect(resubmissionCapReached(ownerView("rejected"), true)).toBe(true);
    // Only a rejected report has a cap to reach.
    expect(resubmissionCapReached(ownerView("held", { moderation: { resubmissionsLeft: 0 } }))).toBe(false);
  });

  test("D16 says the resubmissions are used up before the typing starts", () => {
    const notices = editNotices(
      ownerView("rejected", {
        moderation: { resubmissionsLeft: 0, reasonLabel: "Spam or advertising", note: "Remove the link." },
      }),
    );
    expect(notices[0].key).toBe("resubmit_limit");
    expect(notices[0].tone).toBe("bad");
    expect(notices[0].title).toBe("No resubmissions left");
    expect(notices[0].body).toContain("It wasn't published: Spam or advertising.");
    expect(notices[0].body).toContain("BNX-4471");
    expect(notices[0].quote).toBe("Remove the link.");
    expect(editNotices(ownerView("rejected", { moderation: { resubmissionsLeft: 2 } }))[0].key).toBe(
      "resubmit",
    );
  });

  test("taken down: reason and note, contact support, never an edit", () => {
    const banner = ownerBanner(
      ownerView("deactivated", { moderation: { reasonCode: "legal", note: null } }),
    );
    expect(banner.title).toBe("Taken down");
    expect(banner.reasonLabel).toBe("Legal or safeguarding instruction");
    expect(banner.action).toBe("contact_support");
    expect(ownerEditMode(ownerView("deactivated"))).toBe("none");
  });

  test("every other state edits normally", () => {
    for (const state of ["pending", "held", "approved"]) {
      expect(ownerEditMode(ownerView(state))).toBe("edit");
    }
  });
});

describe("resubmissions — D19", () => {
  test("the fourth resubmission's 409 is recognised", () => {
    const refused = apiError(
      409,
      "This report has been resubmitted the most times allowed. Contact support to have it looked at again.",
    );
    expect(isResubmissionLimitError(refused, "rejected")).toBe(true);
  });

  test("a lock timeout, a take-down refusal or another state is not the limit", () => {
    expect(isResubmissionLimitError(apiError(409, "Try again."), "rejected")).toBe(false);
    expect(
      isResubmissionLimitError(
        apiError(409, "This report was taken down, so it can't be edited. Contact support if you think that is a mistake."),
        "deactivated",
      ),
    ).toBe(false);
    expect(isResubmissionLimitError(apiError(400, "Contact support"), "rejected")).toBe(false);
    expect(isResubmissionLimitError(null, "rejected")).toBe(false);
  });

  test("the remembered limit lives outside the report's own cache key", () => {
    const key = resubmissionLimitKey("r-1");
    expect(key).toEqual(["resubmission-limit", "r-1"]);
    expect(key[0]).not.toBe("report");
  });
});

describe("D16 — edit notices (§10, D19)", () => {
  test("an edit of a live report carries the spec's warning", () => {
    const notices = editNotices(ownerView("approved"));
    expect(notices.map((notice) => notice.key)).toEqual(["recheck"]);
    expect(notices[0].body).toBe(EDIT_WARNING);
    expect(EDIT_WARNING).toBe(
      "Your edit is checked before it goes live again; the report and its comments are hidden while it's checked (usually under a minute).",
    );
  });

  test("a rejected report is resubmitted, with the reason and the note", () => {
    const [notice] = editNotices(
      ownerView("rejected", { moderation: { reasonLabel: "Harassment", note: "Take out the name." } }),
    );
    expect(notice.key).toBe("resubmit");
    expect(notice.title).toBe("Edit and resubmit");
    expect(notice.body).toBe(`It wasn't published: Harassment. ${RESUBMIT_COPY.consequence}`);
    expect(notice.quote).toBe("Take out the name.");
  });

  test("a taken-down report says only that it cannot be edited", () => {
    const notices = editNotices(ownerView("deactivated", { status: "verified" }));
    expect(notices.map((notice) => notice.key)).toEqual(["taken_down"]);
  });

  test("a private report is never promised a check, but still returns to review", () => {
    expect(editNotices(ownerView("approved", { visibility: "private" }))).toEqual([]);
    expect(
      editNotices(ownerView("approved", { visibility: "private", status: "verified" })).map((n) => n.key),
    ).toEqual(["verified"]);
  });

  test("verified and dismissed reports go back for review", () => {
    expect(editNotices(ownerView("approved", { status: "verified" })).map((n) => n.key)).toEqual([
      "recheck",
      "verified",
    ]);
    expect(editNotices(ownerView("approved", { status: "dismissed" })).map((n) => n.key)).toEqual([
      "recheck",
      "dismissed",
    ]);
  });

  test("a report still being checked is told its edit is checked first", () => {
    for (const state of ["pending", "held"]) {
      expect(editNotices(ownerView(state)).map((n) => n.key)).toEqual(["check"]);
    }
  });

  test("the saved message says what happens next", () => {
    expect(editSavedMessage(ownerView("approved"))).toBe("Saved. It's checked before it goes live again.");
    expect(editSavedMessage(ownerView("rejected"))).toBe(
      "Resubmitted. A moderator reads it before it is published.",
    );
    expect(editSavedMessage(ownerView("held"))).toBe("Saved. It's checked before it is published.");
    expect(editSavedMessage(ownerView("approved", { visibility: "private" }))).toBe("Saved.");
  });

  test("D17 says how many sealed files go", () => {
    expect(deleteReportCopy({ files: 4, visibility: "public" })).toBe(
      "It leaves the community feed and your Vault immediately. Its 4 sealed files are destroyed after 30 days — until then, support can reverse the deletion.",
    );
    expect(deleteReportCopy({ files: 1, visibility: "private" })).toContain("It leaves your Vault immediately.");
    expect(deleteReportCopy({ files: 1, visibility: "private" })).toContain("sealed file is destroyed");
  });
});

describe("D4 — comments (§7.5, §10)", () => {
  test("the composer counts to 500 and says the helper line", () => {
    expect(COMMENT_MAX_CHARS).toBe(500);
    expect(COMMENT_HELPER).toBe("Don't share anyone's private details.");
    expect(commentCounter("")).toBe("0/500");
    expect(commentCounter("a".repeat(163))).toBe("163/500");
    expect(clampComment("a".repeat(620))).toHaveLength(500);
    expect(clampComment("short")).toBe("short");
  });

  test("someone else's comment: like, reply and Flag — never delete", () => {
    expect(commentActions({ isMine: false })).toEqual({ like: true, reply: true, flag: true, remove: false });
    expect(commentActions({})).toEqual({ like: true, reply: true, flag: true, remove: false });
  });

  test("your own comment: Delete instead of Flag", () => {
    expect(commentActions({ isMine: true, moderationState: "approved" })).toEqual({
      like: true,
      reply: true,
      flag: false,
      remove: true,
    });
  });

  test("your comment is not answerable until others can see it", () => {
    for (const moderationState of ["pending", "held", "rejected"]) {
      expect(commentActions({ isMine: true, moderationState })).toEqual({
        like: false,
        reply: false,
        flag: false,
        remove: true,
      });
    }
  });

  test("own-state tones", () => {
    expect(ownCommentTone("pending")).toBe("progress");
    expect(ownCommentTone("held")).toBe("attention");
    expect(ownCommentTone("rejected")).toBe("bad");
    expect(ownCommentTone("approved")).toBeNull();
    expect(ownCommentTone(undefined)).toBeNull();
  });

  test("finds a comment's state among roots and replies", () => {
    const roots = [
      { id: "a", replies: [{ id: "a1", isMine: true, moderationState: "pending" }] },
      { id: "b", isMine: true, moderationState: "held", replies: [] },
    ];
    expect(findCommentState(roots, "a")).toBe("approved");
    expect(findCommentState(roots, "a1")).toBe("pending");
    expect(findCommentState(roots, "b")).toBe("held");
    expect(findCommentState(roots, "zzz")).toBeNull();
  });

  test("polls while the new comment is checking or not loaded, inside the window", () => {
    expect(COMMENT_POLL_INTERVAL_MS).toBeLessThan(COMMENT_POLL_WINDOW_MS);
    expect(shouldPollComment("pending", 0)).toBe(true);
    expect(shouldPollComment(null, 1_000)).toBe(true);
    expect(shouldPollComment("pending", COMMENT_POLL_WINDOW_MS)).toBe(false);
    for (const state of ["approved", "held", "rejected"]) {
      expect(shouldPollComment(state, 0)).toBe(false);
    }
    expect(shouldPollComment("pending", -1)).toBe(false);
  });
});

describe("D8/D9 — flags (§7.6, §10)", () => {
  test("the promise comes from expectedWithin", () => {
    expect(flagReceiptLine("within the hour")).toBe("Safety flags are looked at within the hour.");
    expect(flagReceiptLine("within the hour")).toBe(SAFETY_FLAG_LINE);
    expect(flagReceiptLine("within a day")).toBe("Flags like this are looked at within a day.");
    expect(flagReceiptLine(undefined)).toBe("Flags like this are looked at within a day.");
  });

  test("the sheet names who is not told, and the safety promise", () => {
    expect(flagSheetIntro("report")).toContain("The person who filed the report is not told who flagged it.");
    expect(flagSheetIntro("comment")).toContain("The person who posted the comment is not told who flagged it.");
    expect(flagSheetIntro("report")).toContain(SAFETY_FLAG_LINE);
    expect(SAFETY_ROW_HINT).toBe("Looked at within the hour");
  });

  test("the server's refusal is shown in its own words", () => {
    expect(flagErrorMessage(apiError(400, "You can't flag your own report."))).toBe(
      "You can't flag your own report.",
    );
    expect(flagErrorMessage(apiError(404, "That comment is not available."))).toBe(
      "That comment is not available.",
    );
    expect(flagErrorMessage(apiError(429, "Too many requests. Please slow down and try again shortly."))).toContain(
      "Too many requests",
    );
  });

  test("a failure on our side, or offline, is a plain retry line", () => {
    expect(flagErrorMessage(apiError(500, "Internal"))).toBe("That flag did not send. Try again.");
    expect(flagErrorMessage(apiError(401, "Sign in again."))).toBe("That flag did not send. Try again.");
    expect(flagErrorMessage(new Error("boom"))).toBe("That flag did not send. Try again.");
    expect(flagErrorMessage(apiError(0, "x", true))).toContain("offline");
  });
});

describe("B3 — notifications (§7.7)", () => {
  test("the empty state names the kinds the server sends, and no dispatch", () => {
    expect(NOTIFICATIONS_EMPTY_BODY.toLowerCase()).not.toContain("dispatch");
    for (const phrase of ["published", "with a moderator", "corroborating", "replying", "comments", "urgent safety"]) {
      expect(NOTIFICATIONS_EMPTY_BODY).toContain(phrase);
    }
  });

  test("rows that can carry a reason or crisis copy get four lines", () => {
    expect(notificationBodyLines("moderation_notice")).toBe(4);
    expect(notificationBodyLines("status_change")).toBe(4);
    expect(notificationBodyLines("urgent_safety")).toBe(4);
    expect(notificationBodyLines("corroboration_or_reply")).toBe(2);
  });
});
