/**
 * What a member is told about moderation — the owner's status words, the flag
 * catalogue, the receipt stepper, and what C6, C7 and C9 say happens after
 * filing. docs/INCIDENT_MODULE_PLAN.md §3.1–§3.3, §7.4, §10.
 *
 * ── Why this file imports nothing ──────────────────────────────────────────
 * It is the one piece of the moderation module a unit test can load without a
 * React Native runtime (`test/report-moderation.test.js`, run with `bun test`).
 * Importing even `lib/api/reports.ts` would drag the API client, SecureStore and
 * `react-native` in behind it. So the vocabulary is declared here and
 * `lib/api/reports.ts` imports it — the direction of the dependency is the point.
 *
 * ── Mirrors the server, by hand ────────────────────────────────────────────
 * Every code and label below restates `blacknexa-backend/src/types/
 * moderation.interface.ts` (the one taxonomy every layer shares, D6). The member
 * flag labels are the backend's `MEMBER_FLAG_LABELS` word for word, so the tab a
 * flag lands in on the admin console is the one the member meant.
 *
 * ── Two axes, one label ───────────────────────────────────────────────────
 * "Published" is not "Verified" (D1). The server folds the publication axis
 * (`moderationState`) and the case axis (`status`) into one `displayStatus` for
 * the owner — the D2 banner, the Vault chips and the C9 stepper all read that one
 * value. `displayStatusOf` is here only as a fallback for a card or view that
 * arrives without it; the server's value always wins.
 */

// ─────────────────────────────────────────────────────────────────────────────
// States — §3.2
// ─────────────────────────────────────────────────────────────────────────────

/** `reports.moderation_state` — whether anyone but the author can see it. */
export type ReportModerationState = "pending" | "approved" | "held" | "rejected" | "deactivated";

/** A file's own publication state (D22). No `held`: a file is shown or it is not. */
export type EvidenceModerationState = "pending" | "approved" | "rejected";

/** A comment's publication state. Deactivation is a report-only concept. */
export type CommentModerationState = "pending" | "approved" | "held" | "rejected";

/** The one owner-facing status: D2 banner, Vault chip, C9 stepper. */
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

/** The server's chip order (`ALL_DISPLAY_STATUSES`), which is the Vault rail's order. */
export const ALL_DISPLAY_STATUSES: readonly DisplayStatus[] = [
  "checking",
  "with_moderator",
  "not_published",
  "published",
  "private",
  "under_review",
  "verified",
  "dismissed",
  "taken_down",
];

/** §3.2's "Owner label" column, plus *Private* for the private substitution. */
export const DISPLAY_STATUS_LABELS: Readonly<Record<DisplayStatus, string>> = {
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

/**
 * The only states in which the author is shown a reason label and a note
 * (§3.2). A held report shows no reason at all — hold reasons are staff-only.
 */
export const AUTHOR_VISIBLE_MODERATION_STATES: readonly ReportModerationState[] = [
  "rejected",
  "deactivated",
];

export function isAuthorVisibleModerationState(state: ReportModerationState): boolean {
  return AUTHOR_VISIBLE_MODERATION_STATES.includes(state);
}

/**
 * D3: private reports are never sent to the automated check. Everything that
 * says "it is checked before it is published" asks this first, so a private
 * report is never promised a check it will not get.
 */
export function isModerated(visibility: string | null | undefined): boolean {
  return visibility !== "private";
}

/**
 * The §3.2 owner-display table, restated from `displayStatusOf` on the server.
 * Pending → checking, held → with a moderator, rejected → not published,
 * deactivated → taken down, whatever the case status; approved reports show the
 * case status, and approved + submitted + private shows *Private*.
 */
export function displayStatusOf(input: {
  moderationState: ReportModerationState;
  status: string;
  visibility: string;
}): DisplayStatus {
  switch (input.moderationState) {
    case "pending":
      return "checking";
    case "held":
      return "with_moderator";
    case "rejected":
      return "not_published";
    case "deactivated":
      return "taken_down";
    case "approved":
    default:
      switch (input.status) {
        case "under_review":
          return "under_review";
        case "verified":
          return "verified";
        case "dismissed":
          return "dismissed";
        default:
          return input.visibility === "private" ? "private" : "published";
      }
  }
}

/** Narrow an untrusted string (a route param, a stored value) to a display status. */
export function isDisplayStatus(raw: unknown): raw is DisplayStatus {
  return typeof raw === "string" && (ALL_DISPLAY_STATUSES as readonly string[]).includes(raw);
}

/**
 * The display status of an owner's report view (`GET /reports/:id` as the owner —
 * C9, D2). The server's `moderation.displayStatus` wins; without the block (an
 * older server) the report was approved at filing, which is all this can assume.
 */
export function displayStatusForView(view: {
  moderation?: { state?: ReportModerationState; displayStatus?: DisplayStatus } | null;
  status: string;
  visibility: string;
}): DisplayStatus {
  if (view.moderation?.displayStatus) return view.moderation.displayStatus;
  return displayStatusOf({
    moderationState: view.moderation?.state ?? "approved",
    status: view.status,
    visibility: view.visibility,
  });
}

/**
 * The display status of an owner's Vault card. The server sends `displayStatus`
 * on every `mine=true` card; an older server sent only `verified`, which is all
 * this can fall back to — a legacy row was approved at filing (§4.1).
 */
export function displayStatusForCard(card: {
  displayStatus?: DisplayStatus;
  moderationState?: ReportModerationState;
  status?: string;
  verified: boolean;
  visibility: string;
}): DisplayStatus {
  if (card.displayStatus) return card.displayStatus;
  return displayStatusOf({
    moderationState: card.moderationState ?? "approved",
    status: card.status ?? (card.verified ? "verified" : "submitted"),
    visibility: card.visibility,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner copy — D2 banner, Vault row, C9
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a status reads, independent of any theme. The screen maps a tone onto its
 * colour tokens: `progress` the accent, `attention` warn, `bad` the error red,
 * `ok` green, `neutral` and `muted` two steps of grey.
 */
export type StatusTone = "progress" | "attention" | "bad" | "ok" | "neutral" | "muted";

export interface OwnerStatusCopy {
  /** The chip / eyebrow word — §3.2's owner label. */
  label: string;
  tone: StatusTone;
  /** The D2 banner's headline. */
  bannerTitle: string;
  /**
   * The D2 banner's sentence. Never a reason: for `not_published` and
   * `taken_down` the screen adds the server's `reasonLabel` and `note` beneath.
   */
  bannerBody: string;
}

/** C9's held line and D2's banner say the same thing, in the spec's words (§10). */
export const HELD_COPY = "A moderator checks it before it's published — urgent reports within the hour.";

/**
 * The owner's words for each display status.
 *
 * `isPrivate` is the §3.2 private variant: a private report never reaches the
 * feed, so no sentence about it may mention the feed — and it is never sent to
 * the automated check (D3), so none may promise one.
 */
export function ownerStatusCopy(
  displayStatus: DisplayStatus,
  options: { isPrivate?: boolean } = {},
): OwnerStatusCopy {
  const isPrivate = options.isPrivate === true || displayStatus === "private";
  const label = DISPLAY_STATUS_LABELS[displayStatus];
  switch (displayStatus) {
    case "checking":
      return {
        label,
        tone: "progress",
        bannerTitle: "Checking your report",
        bannerBody:
          "An automated safety check reads it before other members can see it — usually in under a minute.",
      };
    case "with_moderator":
      return {
        label,
        tone: "attention",
        bannerTitle: "With a moderator",
        bannerBody: `${HELD_COPY} Other members can't see it until then.`,
      };
    case "not_published":
      return {
        label,
        tone: "bad",
        bannerTitle: "Not published",
        bannerBody: "A moderator decided not to publish it. Other members can't see it.",
      };
    case "taken_down":
      return {
        label,
        tone: "bad",
        bannerTitle: "Taken down",
        bannerBody: isPrivate
          ? "A moderator took it down."
          : "A moderator took it down, so it is no longer in the community feed.",
      };
    case "private":
      return {
        label,
        tone: "neutral",
        bannerTitle: "Saved privately",
        bannerBody:
          "It is never published, and private reports are never sent to the automated check.",
      };
    case "published":
      return isPrivate
        ? {
            label: DISPLAY_STATUS_LABELS.private,
            tone: "neutral",
            bannerTitle: "Saved privately",
            bannerBody:
              "It is never published, and private reports are never sent to the automated check.",
          }
        : {
            label,
            tone: "ok",
            bannerTitle: "Published",
            bannerBody:
              "It is in the community feed. Publishing does not verify it — a moderator may still review the evidence.",
          };
    case "under_review":
      return {
        label,
        // Amber, as F1 and D1 draw it: someone is looking, nothing is wrong.
        tone: "attention",
        bannerTitle: "Under review",
        bannerBody: isPrivate
          ? "A moderator is reviewing the evidence."
          : "A moderator is reviewing the evidence. It stays in the community feed meanwhile.",
      };
    case "verified":
      return {
        label,
        tone: "ok",
        bannerTitle: "Verified",
        bannerBody: "A moderator reviewed the evidence and verified it.",
      };
    case "dismissed":
      return {
        label,
        tone: "muted",
        bannerTitle: "Dismissed",
        bannerBody: isPrivate
          ? "A moderator reviewed it and closed the case."
          : "A moderator reviewed it and closed the case. It stays in the community feed.",
      };
  }
}

/**
 * Whether D2 offers *Edit and resubmit* (§10). Only a rejected report can be
 * resubmitted (D19), and only while the server's cap of three has not been
 * used up: the owner view's `resubmissionsLeft` reaches 0 exactly when the next
 * attempt would be refused with 409 "Contact support". A server that does not
 * send the field is trusted to refuse in its own words instead.
 */
export function canResubmit(
  moderation:
    | { state: ReportModerationState; resubmissionsLeft?: number | null }
    | null
    | undefined,
): boolean {
  return moderation?.state === "rejected" && moderation.resubmissionsLeft !== 0;
}

/** D2's resubmit affordance and the edit warning (§10, D19). */
export const RESUBMIT_COPY = {
  action: "Edit and resubmit",
  consequence: "A moderator reads your edit before it is published.",
} as const;

export const EDIT_WARNING =
  "Your edit is checked before it goes live again; the report and its comments are hidden while it's checked (usually under a minute).";

// ─────────────────────────────────────────────────────────────────────────────
// Author-visible reasons — §3.3
// ─────────────────────────────────────────────────────────────────────────────

/** Reject reasons, worded for the author. The server sends `reasonLabel`; this is the fallback. */
export const REJECT_REASON_LABELS: Readonly<Record<string, string>> = {
  threat: "Threatening content",
  harassment: "Harassment",
  hate: "Hate speech",
  private_info: "Exposes private details",
  misleading: "Fabricated, joke or trolling (not a genuine account)",
  spam: "Spam or advertising",
  graphic: "Graphic or sexual content",
  other: "Other",
};

export const DEACTIVATE_REASON_LABELS: Readonly<Record<string, string>> = {
  reporter_request: "Reporter requested removal",
  legal: "Legal or safeguarding instruction",
  filed_in_error: "Filed in error by the reporter",
  other: "Other",
};

export const DISMISS_REASON_LABELS: Readonly<Record<string, string>> = {
  not_credible: "Not credible on the evidence provided",
  duplicate: "Duplicate of an existing incident",
  out_of_scope: "Outside BlackNexa scope",
  insufficient_detail: "Insufficient detail to proceed",
  withdrawn: "Withdrawn by the reporter",
  other: "Other",
};

function labelFrom(catalogue: Readonly<Record<string, string>>, code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(catalogue, code) ? catalogue[code] : null;
}

/**
 * The reason an owner may be shown, or null. The state names the catalogue; any
 * other state has no author-visible reason, even if a stale code is present.
 */
export function ownerReasonLabel(
  state: ReportModerationState,
  code: string | null | undefined,
): string | null {
  if (state === "rejected") return labelFrom(REJECT_REASON_LABELS, code);
  if (state === "deactivated") return labelFrom(DEACTIVATE_REASON_LABELS, code);
  return null;
}

export function dismissReasonLabel(code: string | null | undefined): string | null {
  return labelFrom(DISMISS_REASON_LABELS, code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner timeline — §7.4
// ─────────────────────────────────────────────────────────────────────────────

/** Owner-safe moderation events on the D2 timeline (`moderationTimeline`). */
export type OwnerModerationEvent =
  | "published"
  | "with_moderator"
  | "not_published"
  | "taken_down"
  | "live_again";

export const OWNER_MODERATION_EVENT_LABELS: Readonly<Record<OwnerModerationEvent, string>> = {
  published: "Published",
  with_moderator: "With a moderator",
  not_published: "Not published",
  taken_down: "Taken down",
  live_again: "Live again",
};

// ─────────────────────────────────────────────────────────────────────────────
// C9 — the receipt stepper
// ─────────────────────────────────────────────────────────────────────────────

/** How often C9 re-reads a report that is still `checking`, and for how long (§10). */
export const RECEIPT_POLL_INTERVAL_MS = 3_000;
export const RECEIPT_POLL_WINDOW_MS = 60_000;

/** C9 keeps polling while this is true. */
export function isSettling(displayStatus: DisplayStatus | null | undefined): boolean {
  return displayStatus === "checking";
}

export type ReceiptStepState = "done" | "current" | "todo" | "stopped";

export interface ReceiptStep {
  key: "filed" | "checked" | "published" | "verified" | "saved";
  label: string;
  state: ReceiptStepState;
}

/**
 * C9's stepper: *Filed → Checked → Published → Verified*, or *Filed → Saved
 * privately* for a private report (§10).
 *
 * The node where a report currently sits takes that state's word — "Checking",
 * "With a moderator", "Under review" — and a node that ended the journey
 * ("Not published", "Taken down", "Dismissed") is `stopped` rather than
 * pretending the next stop is merely ahead.
 */
export function receiptSteps(
  displayStatus: DisplayStatus,
  options: { isPrivate?: boolean } = {},
): ReceiptStep[] {
  const filed: ReceiptStep = { key: "filed", label: "Filed", state: "done" };

  if (options.isPrivate === true || displayStatus === "private") {
    return [
      filed,
      displayStatus === "taken_down"
        ? { key: "saved", label: DISPLAY_STATUS_LABELS.taken_down, state: "stopped" }
        : { key: "saved", label: "Saved privately", state: "done" },
    ];
  }

  const checked = (state: ReceiptStepState, label = "Checked"): ReceiptStep => ({
    key: "checked",
    label,
    state,
  });
  const published = (state: ReceiptStepState, label = "Published"): ReceiptStep => ({
    key: "published",
    label,
    state,
  });
  const verified = (state: ReceiptStepState, label = "Verified"): ReceiptStep => ({
    key: "verified",
    label,
    state,
  });

  switch (displayStatus) {
    case "checking":
      return [filed, checked("current", "Checking"), published("todo"), verified("todo")];
    case "with_moderator":
      return [filed, checked("current", "With a moderator"), published("todo"), verified("todo")];
    case "not_published":
      return [filed, checked("stopped", "Not published"), published("todo"), verified("todo")];
    case "taken_down":
      return [filed, checked("done"), published("stopped", "Taken down"), verified("todo")];
    case "under_review":
      return [filed, checked("done"), published("done"), verified("current", "Under review")];
    case "verified":
      return [filed, checked("done"), published("done"), verified("done")];
    case "dismissed":
      return [filed, checked("done"), published("done"), verified("stopped", "Dismissed")];
    case "published":
    default:
      return [filed, checked("done"), published("done"), verified("todo")];
  }
}

/** The sentence after "Filed 13 Aug, 4:12 PM · Four files sealed." on C9. */
export function receiptSummary(
  displayStatus: DisplayStatus,
  options: { isPrivate?: boolean } = {},
): string {
  if (options.isPrivate === true || displayStatus === "private") {
    return displayStatus === "taken_down"
      ? "A moderator took it down. Open it to see why."
      : "It is saved privately in your Vault and is never published.";
  }
  switch (displayStatus) {
    case "checking":
      return "It is being checked before it is published — usually in under a minute.";
    case "with_moderator":
      return HELD_COPY;
    case "not_published":
      return "It was not published. Open it to see why.";
    case "taken_down":
      return "A moderator took it down. Open it to see why.";
    case "under_review":
      return "It is published, and a moderator is reviewing the evidence.";
    case "verified":
      return "It is published and verified.";
    case "dismissed":
      return "It is published. A moderator reviewed it and closed the case.";
    case "published":
    default:
      return "It is live in the community feed.";
  }
}

/**
 * C9 after the polling window (§10: every 3 s for 60 s) with the report still
 * being checked. Both outcomes send the owner a notification (§7.7), so the screen
 * can promise one instead of asking them to wait.
 */
export const STILL_CHECKING_COPY =
  "Still checking. We'll send you a notification when it's published, or if a moderator needs to look at it first.";

// ─────────────────────────────────────────────────────────────────────────────
// Filing copy — C6, C7, C9 (§10 "Copy")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C6's urgent card. The caption: it "prints its consequence whether the switch is
 * on or off" — so both halves, always, in §10's words. A private report is never
 * checked or published (D3), so its variant promises neither; urgency still puts
 * it in front of a moderator.
 */
export function urgentConsequence(visibility: string | null | undefined): string {
  if (!isModerated(visibility)) {
    return "On: a moderator looks at it within the hour. Off: it joins the normal queue. Private reports are never published and never sent to the automated check.";
  }
  return "On: checked right away, and a moderator looks at it within the hour. Off: most reports are checked and published within minutes; some wait for a moderator.";
}

/**
 * C7's "What happens when you file" (§10): the automated safety check, then
 * published or a moderator checks it first. The last sentence is the board's and
 * stays until the legal copy is signed off (plan §13).
 */
export function filingExplainer(input: {
  files: number;
  visibility: string | null | undefined;
}): string {
  const files = Math.max(0, Math.floor(Number.isFinite(input.files) ? input.files : 0));
  const sealed =
    files === 0
      ? "The report is filed."
      : `Your ${files === 1 ? "file is" : `${files} files are`} sealed, then the report is filed.`;
  const next = isModerated(input.visibility)
    ? "An automated safety check reads it first: most reports are published within minutes, and anything the check is unsure about waits for a moderator before it is published."
    : "It is saved privately in your Vault — private reports are never published and never sent to the automated check.";
  return `${sealed} ${next} Nothing is sent to any outside organisation.`;
}

/**
 * C9's WHO CAN SEE IT, in words rather than a label. A moderated report is only
 * seen once it is published, so the sentence says so — the old copy promised the
 * feed straight away.
 */
export function audienceCopy(input: {
  visibility: string | null | undefined;
  anonymous: boolean;
}): string {
  const anonymousClause = input.anonymous ? ", without your name or photo" : "";
  switch (input.visibility) {
    case "public":
      return `Anyone in the community feed${anonymousClause}, once it is published. Moderators can still see who filed it.`;
    case "trusted":
      return `Verified advocates only${anonymousClause}, once it is published. Nothing appears in the public feed.`;
    case "private":
      return "Only you. It still counts toward your own record.";
    default:
      return "Only the people your visibility setting allows.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety holds — D21
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The crisis copy the server sends with a safety hold (`OWNER_NOTIFICATIONS.
 * withModeratorSafety`), word for word. The owner's report view does not say
 * whether a hold was a safety hold, so no screen can choose this variant on its
 * own yet — the push and the B3 row carry it, from the server.
 */
export const SAFETY_HOLD_COPY = {
  title: "Your report is with a moderator",
  body: "If you or someone else is in danger right now, call your local emergency number. A moderator is looking at your report now.",
} as const;

export interface CrisisLine {
  name: string;
  /** What the typed action dials or texts. Never rendered as bare text (G section rule). */
  contact: string;
  action: "call" | "text";
  detail: string;
}

/** The two lines G12 lists first — "Emergency" and the 988 Lifeline. */
export const CRISIS_LINES: readonly CrisisLine[] = [
  { name: "Emergency services", contact: "911", action: "call", detail: "United States · 24/7" },
  {
    name: "988 Suicide & Crisis Lifeline",
    contact: "988",
    action: "call",
    detail: "24/7 · Call or text",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Flags — §3.1, D6, D7
// ─────────────────────────────────────────────────────────────────────────────

/** The eight policy codes, in the server's fixed order. */
export type PolicyCategory =
  | "threat"
  | "harassment"
  | "hate"
  | "private_info"
  | "misleading"
  | "spam"
  | "graphic"
  | "other";

export const POLICY_CATEGORIES: readonly PolicyCategory[] = [
  "threat",
  "harassment",
  "hate",
  "private_info",
  "misleading",
  "spam",
  "graphic",
  "other",
];

/**
 * A comment is not "a fabricated report" and carries no media, so the comment
 * sheet offers six (§3.1).
 */
export const COMMENT_FLAG_CATEGORIES: readonly PolicyCategory[] = [
  "threat",
  "harassment",
  "hate",
  "private_info",
  "spam",
  "other",
];

/** The backend's `MEMBER_FLAG_LABELS`, word for word — written from the flagger's side. */
export const MEMBER_FLAG_LABELS: Readonly<Record<PolicyCategory, string>> = {
  threat: "It threatens or encourages violence",
  harassment: "It harasses or bullies someone",
  hate: "It attacks people for who they are",
  private_info: "It exposes someone's private details",
  misleading: "It's fake or trolling",
  spam: "Spam or advertising",
  graphic: "Graphic or sexual content",
  other: "Something else",
};

/** Flags in these categories are looked at within the hour (§4.4, `SAFETY_CATEGORIES`). */
export const SAFETY_CATEGORIES: readonly PolicyCategory[] = ["threat", "private_info", "graphic"];

/** The flag sheet's promise (§10), kept true by the server's `safetyFlagBreached` metric. */
export const SAFETY_FLAG_LINE = "Safety flags are looked at within the hour.";

/** The three codes the old D8 sheet sent. The server still accepts and normalises them. */
export type LegacyFlagCode = "threatening" | "private_details" | "untrue";

export const LEGACY_FLAG_CODES: Readonly<Record<LegacyFlagCode, PolicyCategory>> = {
  threatening: "threat",
  private_details: "private_info",
  untrue: "misleading",
};

export function isPolicyCategory(raw: unknown): raw is PolicyCategory {
  return typeof raw === "string" && (POLICY_CATEGORIES as readonly string[]).includes(raw);
}

/** Canonical or legacy code → canonical code; anything else is null, never a guess. */
export function normaliseFlagCategory(raw: string | null | undefined): PolicyCategory | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  if (isPolicyCategory(code)) return code;
  if (Object.prototype.hasOwnProperty.call(LEGACY_FLAG_CODES, code)) {
    return LEGACY_FLAG_CODES[code as LegacyFlagCode];
  }
  return null;
}

export function isSafetyCategory(code: PolicyCategory): boolean {
  return SAFETY_CATEGORIES.includes(code);
}

export interface FlagOption {
  code: PolicyCategory;
  label: string;
  /** True for the categories a moderator sees within the hour. */
  safety: boolean;
}

function optionFor(code: PolicyCategory): FlagOption {
  return { code, label: MEMBER_FLAG_LABELS[code], safety: isSafetyCategory(code) };
}

/** The report sheet's eight rows, in the server's order. */
export const REPORT_FLAG_OPTIONS: readonly FlagOption[] = POLICY_CATEGORIES.map(optionFor);

/** The comment sheet's six rows. */
export const COMMENT_FLAG_OPTIONS: readonly FlagOption[] = COMMENT_FLAG_CATEGORIES.map(optionFor);

export function flagOptionsFor(target: "report" | "comment"): readonly FlagOption[] {
  return target === "comment" ? COMMENT_FLAG_OPTIONS : REPORT_FLAG_OPTIONS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments and evidence — §7.4, §10
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the author reads under their own comment (§10). Null once it is approved
 * — an approved comment looks like everyone else's.
 */
export function ownCommentStateLabel(
  state: CommentModerationState | null | undefined,
): string | null {
  switch (state) {
    case "pending":
      return "Checking…";
    case "held":
      return "Held for review";
    case "rejected":
      return "Removed by a moderator";
    default:
      return null;
  }
}

/**
 * A file's review label. A viewer is sent `pendingReview` for a file they may
 * know exists but not open yet (§7.3) — the "Awaiting review" tile. The owner
 * sees their own files' state instead.
 */
export function evidenceReviewLabel(
  file: { pendingReview?: boolean; moderationState?: EvidenceModerationState },
  options: { owner?: boolean } = {},
): string | null {
  if (options.owner) {
    if (file.moderationState === "pending") return "Awaiting review";
    if (file.moderationState === "rejected") return "Hidden from others by a moderator";
    return null;
  }
  return file.pendingReview ? "Awaiting review" : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vault F1 — the status rail
// ─────────────────────────────────────────────────────────────────────────────

/** One chip on F1's rail: All, Drafts, then one per display status. */
export type VaultChip = "all" | "drafts" | DisplayStatus;

export const VAULT_CHIPS: readonly VaultChip[] = ["all", "drafts", ...ALL_DISPLAY_STATUSES];

export function vaultChipLabel(chip: VaultChip): string {
  if (chip === "all") return "All";
  if (chip === "drafts") return "Drafts";
  return DISPLAY_STATUS_LABELS[chip];
}

export type VaultCounts = Record<VaultChip, number>;

/** Count filed reports by display status, plus the drafts. `all` is both together. */
export function vaultCounts(
  statuses: readonly DisplayStatus[],
  draftCount: number,
): VaultCounts {
  const counts = { all: 0, drafts: 0 } as VaultCounts;
  for (const status of ALL_DISPLAY_STATUSES) counts[status] = 0;
  for (const status of statuses) counts[status] += 1;
  const drafts = Math.max(0, Math.floor(Number.isFinite(draftCount) ? draftCount : 0));
  counts.drafts = drafts;
  counts.all = statuses.length + drafts;
  return counts;
}

/**
 * The chips F1 draws. Zero-count chips are hidden (§10) — except *All*, and the
 * chip currently selected, so a filter never vanishes out from under the person
 * using it. With `counts` null (not all reports could be counted) every chip is
 * shown rather than guessing which are empty.
 */
export function visibleVaultChips(
  counts: VaultCounts | null,
  selected: VaultChip,
): VaultChip[] {
  if (!counts) return [...VAULT_CHIPS];
  return VAULT_CHIPS.filter(
    (chip) => chip === "all" || chip === selected || counts[chip] > 0,
  );
}
