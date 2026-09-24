/**
 * The decisions behind D1, D2, D4, D11, D16 and B3 that are worth a unit test —
 * what a viewer may be shown, what the owner is told, which actions a comment
 * row offers, what the flag sheet promises. docs/INCIDENT_MODULE_PLAN.md §3.2,
 * §7.3–§7.6, §10.
 *
 * ── Why this file is separate from `moderation.ts` ────────────────────────
 * `moderation.ts` is the shared vocabulary (states, labels, the flag catalogue)
 * that the wizard, the Vault and these screens all read. This file is the
 * *screen logic* built on it: merging the owner's two timelines, deciding what
 * an evidence tile may show, when to stop re-reading a comment that is still
 * being checked. Like `moderation.ts` it imports nothing that needs a React
 * Native runtime (the one import is that leaf module, and every wire shape is
 * restated structurally), so `test/report-detail.test.js` runs it under
 * `bun test` directly.
 *
 * ── The two rules most of this file serves ────────────────────────────────
 *   • A viewer never sees moderation words about someone else's report — no
 *     "Under review" pill, no "Checking". A viewer only ever reaches a
 *     published report (§3.2), and whether its evidence is still being looked
 *     at is said about the *file* ("Awaiting review"), never the report.
 *   • The owner is told everything they may be told (§3.2): the state, and a
 *     reason and note only for "Not published" and "Taken down". Hold reasons
 *     are staff-only, so a held report's banner never guesses at one.
 */

import {
  EDIT_WARNING,
  OWNER_MODERATION_EVENT_LABELS,
  RESUBMIT_COPY,
  SAFETY_FLAG_LINE,
  STILL_CHECKING_COPY,
  displayStatusForView,
  ownerReasonLabel,
  ownerStatusCopy,
  type CommentModerationState,
  type DisplayStatus,
  type EvidenceModerationState,
  type OwnerModerationEvent,
  type ReportModerationState,
  type StatusTone,
} from "@/lib/report/moderation";

// ─────────────────────────────────────────────────────────────────────────────
// Structural wire shapes — restated so this file needs no API client
// ─────────────────────────────────────────────────────────────────────────────

/** The owner-view fields the banner, the edit notices and sharing read. */
export interface OwnerViewInput {
  caseRef: string;
  status: string;
  visibility: string;
  moderation?: {
    state: ReportModerationState;
    displayStatus?: DisplayStatus;
    reasonCode?: string | null;
    reasonLabel?: string | null;
    note?: string | null;
    /** Rejected reports only — see `resubmissionCapReached`. */
    resubmissionsLeft?: number | null;
  } | null;
}

/** One node of `timeline` or `moderationTimeline` (`StatusEventView`). */
export interface TimelineEventInput {
  status: string;
  at: string;
  actorLabel: string | null;
  note: string | null;
  moderationEvent?: OwnerModerationEvent;
  reasonLabel?: string | null;
}

/** An `EvidenceView`, as far as a tile or the lightbox reads it. */
export interface EvidenceInput {
  kind: string;
  url: string | null;
  thumbUrl: string | null;
  moderationState?: EvidenceModerationState;
  pendingReview?: boolean;
  fullResolutionPending?: boolean;
}

/** A `CommentView`, as far as the row's actions and the poll read it. */
export interface CommentInput {
  id: string;
  isMine?: boolean;
  moderationState?: CommentModerationState;
  replies?: CommentInput[];
}

/** What `ApiError` carries, read structurally (`lib/api/client.ts`). */
export interface ErrorInfo {
  status: number | null;
  offline: boolean;
  message: string | null;
}

export function errorInfo(err: unknown): ErrorInfo {
  if (!err || typeof err !== "object") return { status: null, offline: false, message: null };
  const candidate = err as { status?: unknown; offline?: unknown; message?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const message =
    typeof candidate.message === "string" && candidate.message.trim() ? candidate.message.trim() : null;
  return { status, offline: candidate.offline === true, message };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading a report — D1 and D2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retry a report read only when retrying can help. A 404 is the server's single
 * answer for "gone", "private" and "not published yet" alike (§7.3), so asking
 * again only keeps the skeleton up for longer before the honest answer.
 */
export function shouldRetryRead(failureCount: number, err: unknown): boolean {
  const { status } = errorInfo(err);
  if (status !== null && status < 500) return false;
  return failureCount < 1;
}

export interface ScreenErrorCopy {
  title: string;
  body: string;
  /** True when "Try again" can plausibly help. */
  retry: boolean;
}

/**
 * The error state of D1 and D2: I3's words for a failure on our side, and the
 * existing "not available" words for a 404 — which, for a viewer, is also what a
 * report that is not published yet looks like, on purpose (§7.3).
 */
export function readErrorCopy(err: unknown, options: { owner?: boolean } = {}): ScreenErrorCopy {
  const info = errorInfo(err);
  if (info.status === 404 || info.status === 403) {
    return {
      title: "That report is not available",
      body: options.owner
        ? "It may have been deleted."
        : "It may have been removed, or it may not be public.",
      retry: false,
    };
  }
  if (info.offline) {
    return {
      title: "You're offline",
      body: "Connect to the internet and try again.",
      retry: true,
    };
  }
  return {
    title: "Something went wrong on our end",
    body: "This isn't you. Give it a moment and try again.",
    retry: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 — what a viewer is shown
// ─────────────────────────────────────────────────────────────────────────────

export type ViewerPill = "urgent" | "verified";

/**
 * D1's status pills (§10 "Viewer D1"). Never *Under review* or *Dismissed*: a
 * viewer only reaches published reports, and the case axis is the owner's
 * business until it ends in Verified — the one outcome a reader needs.
 */
export function viewerStatusPills(view: { urgent: boolean; status: string }): ViewerPill[] {
  const pills: ViewerPill[] = [];
  if (view.urgent) pills.push("urgent");
  if (view.status === "verified") pills.push("verified");
  return pills;
}

/**
 * Whether the share action can work (§11a "Sharing"). The owner may share a
 * published, non-private report (a minted link); anyone else only a public one
 * (the plain URL). Everything else is refused by the server, so the action is
 * not offered rather than offered and failed.
 */
export function canShare(view: {
  visibility: string;
  isOwner: boolean;
  moderation?: { state: ReportModerationState } | null;
}): boolean {
  if (view.visibility === "private") return false;
  if (view.isOwner) return (view.moderation?.state ?? "approved") === "approved";
  return view.visibility === "public";
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence — D1, D2, D11 (D22, §7.3, §11a media binding)
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceTileState = "open" | "preview" | "awaiting" | "owner_pending" | "owner_hidden";

export interface EvidenceTile {
  state: EvidenceTileState;
  /** What the tile draws. Null for a file the viewer may not open yet. */
  image: string | null;
  /** False only for "Awaiting review": there is nothing behind the tap. */
  openable: boolean;
  /** The word on the tile, or null for an ordinary file. */
  badge: string | null;
}

/**
 * One evidence tile.
 *
 * A viewer is sent approved files with URLs, files still waiting for a
 * moderator as `pendingReview` with none (drawn "Awaiting review"), and photos
 * whose approval covered only the sealed preview as `fullResolutionPending`
 * (the thumbnail, marked "Preview"). The owner always has both URLs and is told
 * their own file's state instead.
 */
export function evidenceTile(file: EvidenceInput, options: { owner?: boolean } = {}): EvidenceTile {
  if (options.owner) {
    if (file.moderationState === "pending") {
      return { state: "owner_pending", image: file.thumbUrl, openable: true, badge: "Awaiting review" };
    }
    if (file.moderationState === "rejected") {
      return { state: "owner_hidden", image: file.thumbUrl, openable: true, badge: "Hidden" };
    }
    return { state: "open", image: file.thumbUrl, openable: true, badge: null };
  }
  if (file.pendingReview) {
    return { state: "awaiting", image: null, openable: false, badge: "Awaiting review" };
  }
  if (file.fullResolutionPending) {
    return { state: "preview", image: file.thumbUrl, openable: true, badge: "Preview" };
  }
  return { state: "open", image: file.thumbUrl, openable: true, badge: null };
}

/** The sentences under the grid that explain its badges — one per kind present. */
export function evidenceGridNotes(files: readonly EvidenceInput[], options: { owner?: boolean } = {}): string[] {
  const states = new Set(files.map((file) => evidenceTile(file, options).state));
  const notes: string[] = [];
  if (states.has("awaiting")) {
    notes.push("Files marked Awaiting review appear once a moderator clears them.");
  }
  if (states.has("preview")) {
    notes.push("Photos marked Preview show a smaller copy — the full image is awaiting review.");
  }
  if (states.has("owner_pending")) {
    notes.push("Only you can see files awaiting review until a moderator clears them.");
  }
  if (states.has("owner_hidden")) {
    notes.push("A moderator hid a file from other members. You can still see it.");
  }
  return notes;
}

/**
 * What the D11 frame draws for a file. A viewer's `fullResolutionPending` photo
 * opens on its thumbnail (the only URL they were sent); a file awaiting review
 * has nothing to draw.
 */
export function evidenceFrameImage(file: EvidenceInput): string | null {
  if (file.pendingReview) return null;
  return file.url ?? file.thumbUrl;
}

/** The line D11 prints under a file whose state needs saying, or null. */
export function evidenceFrameNote(file: EvidenceInput, options: { owner?: boolean } = {}): string | null {
  switch (evidenceTile(file, options).state) {
    case "awaiting":
      return "Awaiting review. A moderator clears each file before other members can open it.";
    case "preview":
      return file.kind === "photo"
        ? "You're seeing a preview. The full image is awaiting review."
        : "You're seeing a preview. The full file is awaiting review.";
    case "owner_pending":
      return "Only you can see this file until a moderator clears it.";
    case "owner_hidden":
      return "A moderator hid this file from other members. You can still see it.";
    case "open":
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D2 — the owner's timeline (§7.4, §11a "Owner view")
// ─────────────────────────────────────────────────────────────────────────────

/** Case-status words, as D2 has always printed them. */
export const CASE_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  verified: "Verified",
  dismissed: "Dismissed",
};

const CASE_STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  draft: "neutral",
  submitted: "ok",
  under_review: "attention",
  verified: "ok",
  dismissed: "muted",
};

const MODERATION_EVENT_TONES: Readonly<Record<OwnerModerationEvent, StatusTone>> = {
  published: "ok",
  live_again: "ok",
  with_moderator: "attention",
  not_published: "bad",
  taken_down: "bad",
};

export interface OwnerTimelineNode {
  key: string;
  source: "status" | "moderation";
  label: string;
  at: string;
  /** "by a moderator", or null for the pipeline and the author. */
  actorLabel: string | null;
  /** Author-visible reason — a dismissal, a rejection, a take-down. */
  reasonLabel: string | null;
  /** An author-visible note on a case-status event ("Edited by the author"). */
  note: string | null;
  tone: StatusTone;
  /** The last node: where the report is now. */
  current: boolean;
}

/**
 * One history from the two lists the owner view sends: `timeline` (case-status
 * events) and `moderationTimeline` (published, with a moderator, not published,
 * taken down, live again). Merged by `at`; on a tie the status event comes
 * first, because filing writes it before the pipeline decides (the server's own
 * rule, `report_timeline.ts`). A timestamp that does not parse keeps its place
 * at the end rather than jumping to the top.
 *
 * The server emits no event when a report goes back to `pending` (filing, an
 * edit — `report_timeline.ts` says so), so without help the last node of a
 * report being checked would be "Submitted" or "Published", drawn as where it
 * is now. Pass `now` (the owner view's `moderation`) and a report that is
 * `checking` ends in a *Checking* node, from when the check began.
 */
export function ownerTimelineNodes(
  timeline: readonly TimelineEventInput[],
  moderationTimeline: readonly TimelineEventInput[] = [],
  now?: { displayStatus: DisplayStatus; at: string | null } | null,
): OwnerTimelineNode[] {
  const timeOf = (at: string): number => {
    const value = Date.parse(at);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };

  const tagged = [
    ...timeline.map((event, index) => ({ event, index, order: 0 as const })),
    ...moderationTimeline
      .filter((event) => Boolean(event.moderationEvent))
      .map((event, index) => ({ event, index, order: 1 as const })),
  ];
  tagged.sort((a, b) => {
    const timeA = timeOf(a.event.at);
    const timeB = timeOf(b.event.at);
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.index - b.index;
  });

  const nodes: OwnerTimelineNode[] = tagged.map(({ event, index, order }, position) => {
    const moderationEvent = order === 1 ? event.moderationEvent : undefined;
    const label = moderationEvent
      ? OWNER_MODERATION_EVENT_LABELS[moderationEvent]
      : CASE_STATUS_LABELS[event.status] ?? event.status;
    const tone = moderationEvent
      ? MODERATION_EVENT_TONES[moderationEvent]
      : CASE_STATUS_TONES[event.status] ?? "neutral";
    const note = event.note?.trim() ? event.note.trim() : null;
    const reasonLabel = event.reasonLabel?.trim() ? event.reasonLabel.trim() : null;
    return {
      key: `${order === 1 ? "m" : "s"}-${index}-${event.at}`,
      source: order === 1 ? "moderation" : "status",
      label,
      at: event.at,
      actorLabel: event.actorLabel,
      reasonLabel,
      note,
      tone,
      current: position === tagged.length - 1,
    };
  });

  if (now?.displayStatus === "checking") {
    const last = nodes[nodes.length - 1];
    if (last) last.current = false;
    nodes.push({
      key: "now-checking",
      source: "moderation",
      label: "Checking",
      at: now.at ?? last?.at ?? "",
      actorLabel: null,
      reasonLabel: null,
      note: null,
      tone: "progress",
      current: true,
    });
  }

  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// D2 — the moderation banner and what the owner can do (§10 "D2 owner")
// ─────────────────────────────────────────────────────────────────────────────

/** The display statuses D2 draws a banner for. The rest read from the timeline. */
const BANNER_STATUSES: readonly DisplayStatus[] = ["checking", "with_moderator", "not_published", "taken_down"];

export type OwnerBannerAction = "resubmit" | "contact_support";

export interface OwnerBanner {
  displayStatus: DisplayStatus;
  tone: StatusTone;
  title: string;
  body: string;
  /** Only for Not published and Taken down (§3.2). */
  reasonLabel: string | null;
  /** The moderator's note to the author, same states only. */
  note: string | null;
  action: OwnerBannerAction | null;
  /** The sentence beside the action. */
  actionHint: string | null;
}

/**
 * Whether *Edit and resubmit* is used up (D19, §10 "hidden after 3"). The owner
 * view says so before anyone tries — `moderation.resubmissionsLeft` reaches 0
 * exactly when the server's next answer would be 409 "Contact support".
 * `learned` is what D16 recorded from such a refusal (`resubmissionLimitKey`),
 * the only signal a server older than that field gives.
 */
export function resubmissionCapReached(view: OwnerViewInput, learned = false): boolean {
  if (learned) return true;
  const moderation = view.moderation;
  return moderation?.state === "rejected" && moderation.resubmissionsLeft === 0;
}

/**
 * D2's banner: checking, with a moderator, not published (reason, note, *Edit
 * and resubmit*), taken down (reason, note). The server caps resubmissions at
 * three; once they are used up (`resubmissionCapReached` — from the view, or
 * from a refusal the screen learned of through `resubmissionLimitReached`) the
 * action becomes *Contact support*.
 */
export function ownerBanner(
  view: OwnerViewInput,
  options: { resubmissionLimitReached?: boolean; stillChecking?: boolean } = {},
): OwnerBanner | null {
  const displayStatus = displayStatusForView(view);
  if (!BANNER_STATUSES.includes(displayStatus)) return null;

  const copy = ownerStatusCopy(displayStatus, { isPrivate: view.visibility === "private" });
  const moderation = view.moderation ?? null;
  const reasonLabel =
    moderation?.reasonLabel?.trim() ||
    (moderation ? ownerReasonLabel(moderation.state, moderation.reasonCode) : null) ||
    null;
  const note = moderation?.note?.trim() ? moderation.note.trim() : null;

  const banner: OwnerBanner = {
    displayStatus,
    tone: copy.tone,
    title: copy.bannerTitle,
    body: copy.bannerBody,
    reasonLabel: null,
    note: null,
    action: null,
    actionHint: null,
  };

  switch (displayStatus) {
    case "checking":
      if (options.stillChecking) banner.body = STILL_CHECKING_COPY;
      return banner;
    case "with_moderator":
      return banner;
    case "not_published":
      banner.reasonLabel = reasonLabel;
      banner.note = note;
      if (resubmissionCapReached(view, options.resubmissionLimitReached === true)) {
        banner.action = "contact_support";
        banner.actionHint = `You've resubmitted it the most times allowed. Contact support and quote ${view.caseRef} to have it looked at again.`;
      } else {
        banner.action = "resubmit";
        banner.actionHint = RESUBMIT_COPY.consequence;
      }
      return banner;
    case "taken_down":
    default:
      banner.reasonLabel = reasonLabel;
      banner.note = note;
      banner.action = "contact_support";
      banner.actionHint = `Contact support and quote ${view.caseRef} if you think this is a mistake.`;
      return banner;
  }
}

/**
 * Which edit D2's MANAGE section offers. A taken-down report cannot be edited
 * (the server refuses, D19); a rejected one is resubmitted from the banner, and
 * not at all once the resubmissions are used up.
 */
export function ownerEditMode(
  view: OwnerViewInput,
  options: { resubmissionLimitReached?: boolean } = {},
): "edit" | "resubmit" | "none" {
  const displayStatus = displayStatusForView(view);
  if (displayStatus === "taken_down") return "none";
  if (displayStatus === "not_published") {
    return resubmissionCapReached(view, options.resubmissionLimitReached === true) ? "none" : "resubmit";
  }
  return "edit";
}

/**
 * True for the server's answer to a fourth resubmission (D19): 409 on a
 * rejected report, worded "…Contact support…". A lock timeout is also a 409
 * ("Try again", §5.4), so the status alone is not enough.
 */
export function isResubmissionLimitError(
  err: unknown,
  moderationState: ReportModerationState | null | undefined,
): boolean {
  const info = errorInfo(err);
  return (
    info.status === 409 &&
    moderationState === "rejected" &&
    info.message !== null &&
    /contact support/i.test(info.message)
  );
}

/**
 * Where D16 records a refused fourth resubmission so D2 can swap *Edit and
 * resubmit* for *Contact support* (a query-cache key, kept for the session).
 * Deliberately not under `["report", ref]`: invalidating the report must not
 * forget what the server already said. The count only ever grows (D19), so
 * the answer cannot go stale.
 */
export function resubmissionLimitKey(reportId: string): readonly ["resubmission-limit", string] {
  return ["resubmission-limit", reportId] as const;
}

/** D17, with the file count said out loud — the board's "Its four sealed files". */
export function deleteReportCopy(input: { files: number; visibility: string }): string {
  const files = Math.max(0, Math.floor(Number.isFinite(input.files) ? input.files : 0));
  const leaves =
    input.visibility === "private"
      ? "It leaves your Vault immediately."
      : "It leaves the community feed and your Vault immediately.";
  const sealed =
    files === 0
      ? "Until 30 days have passed, support can still reverse the deletion."
      : `Its ${files === 1 ? "sealed file is" : `${files} sealed files are`} destroyed after 30 days — until then, support can reverse the deletion.`;
  return `${leaves} ${sealed}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// D16 — editing (§10, D19)
// ─────────────────────────────────────────────────────────────────────────────

export interface EditNotice {
  key: "taken_down" | "resubmit" | "resubmit_limit" | "recheck" | "check" | "verified" | "dismissed";
  tone: StatusTone;
  title: string;
  body: string;
  /** The moderator's note, repeated where it tells the author what to fix. */
  quote?: string | null;
}

/**
 * The consequences D16 states *before* the save — the same principle as C6's
 * urgent card. A private report is never checked (D3), so it is never promised
 * a check; the case axis (verified or dismissed going back for review) applies
 * to every report.
 */
export function editNotices(view: OwnerViewInput): EditNotice[] {
  const displayStatus = displayStatusForView(view);
  if (displayStatus === "taken_down") {
    return [
      {
        key: "taken_down",
        tone: "bad",
        title: "This report was taken down",
        body: "A moderator took it down, so it can't be edited. Contact support if you think that is a mistake.",
      },
    ];
  }

  const notices: EditNotice[] = [];
  const moderated = view.visibility !== "private";

  if (displayStatus === "not_published") {
    const banner = ownerBanner(view);
    // Used up: the server would refuse the save, so say so before the typing.
    const capped = resubmissionCapReached(view);
    const next = capped && banner?.actionHint ? banner.actionHint : RESUBMIT_COPY.consequence;
    notices.push({
      key: capped ? "resubmit_limit" : "resubmit",
      tone: capped ? "bad" : "attention",
      title: capped ? "No resubmissions left" : RESUBMIT_COPY.action,
      body: banner?.reasonLabel ? `It wasn't published: ${banner.reasonLabel}. ${next}` : next,
      quote: banner?.note ?? null,
    });
  } else if (moderated && (displayStatus === "checking" || displayStatus === "with_moderator")) {
    notices.push({
      key: "check",
      tone: "progress",
      title: "Your edit is checked first",
      body: "Your edit is checked before the report is published — usually in under a minute.",
    });
  } else if (moderated) {
    notices.push({
      key: "recheck",
      tone: "progress",
      title: "Your edit is checked first",
      body: EDIT_WARNING,
    });
  }

  if (view.status === "verified") {
    notices.push({
      key: "verified",
      tone: "attention",
      title: "This report is verified",
      body: "Changing the words sends it back for review, and the Verified badge comes off until a moderator has read it again.",
    });
  } else if (view.status === "dismissed") {
    notices.push({
      key: "dismissed",
      tone: "attention",
      title: "This report was dismissed",
      body: "Changing the words reopens the case: it goes back to a moderator for review.",
    });
  }

  return notices;
}

/** The snackbar after a successful edit, in the terms of what happens next. */
export function editSavedMessage(before: OwnerViewInput): string {
  if (before.visibility === "private") return "Saved.";
  switch (displayStatusForView(before)) {
    case "not_published":
      return "Resubmitted. A moderator reads it before it is published.";
    case "checking":
    case "with_moderator":
      return "Saved. It's checked before it is published.";
    default:
      return "Saved. It's checked before it goes live again.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D4 — comments (§7.5, §10 "Comments")
// ─────────────────────────────────────────────────────────────────────────────

/** D18/D19's limit. The server accepts more; the design asks for 500. */
export const COMMENT_MAX_CHARS = 500;

/** D18's helper line, in §10's words. */
export const COMMENT_HELPER = "Don't share anyone's private details.";

/** "163/500". */
export function commentCounter(text: string): string {
  return `${Math.min(text.length, COMMENT_MAX_CHARS)}/${COMMENT_MAX_CHARS}`;
}

export function clampComment(text: string): string {
  return text.length > COMMENT_MAX_CHARS ? text.slice(0, COMMENT_MAX_CHARS) : text;
}

export interface CommentRowActions {
  like: boolean;
  reply: boolean;
  flag: boolean;
  remove: boolean;
}

/**
 * What a comment row offers. Your own comment has *Delete* instead of *Flag*
 * (the server refuses a flag on your own words anyway). While it is still being
 * checked, held or removed, nobody else can see it, so it cannot be liked or
 * replied to — the server answers both with 404 until it is approved.
 */
export function commentActions(comment: Pick<CommentInput, "isMine" | "moderationState">): CommentRowActions {
  const mine = comment.isMine === true;
  const shown = !mine || comment.moderationState === undefined || comment.moderationState === "approved";
  return { like: shown, reply: shown, flag: !mine, remove: mine };
}

/** The tone of the author's own-state label ("Checking…", "Held for review", "Removed…"). */
export function ownCommentTone(state: CommentModerationState | null | undefined): StatusTone | null {
  switch (state) {
    case "pending":
      return "progress";
    case "held":
      return "attention";
    case "rejected":
      return "bad";
    default:
      return null;
  }
}

/**
 * A comment's state in the loaded thread: its `moderationState` (approved when
 * the server omits it), or null when it is not on any loaded page.
 */
export function findCommentState(
  roots: readonly CommentInput[],
  id: string,
): CommentModerationState | null {
  for (const root of roots) {
    if (root.id === id) return root.moderationState ?? "approved";
    for (const reply of root.replies ?? []) {
      if (reply.id === id) return reply.moderationState ?? "approved";
    }
  }
  return null;
}

/** How often D4 re-reads the thread while a new comment is being checked, and for how long. */
export const COMMENT_POLL_INTERVAL_MS = 2_500;
export const COMMENT_POLL_WINDOW_MS = 45_000;

/**
 * Keep re-reading while the comment just posted is still `pending` — or not
 * loaded yet — and the window is open. Held, rejected and approved all end it:
 * each is a state the author is now looking at.
 */
export function shouldPollComment(state: CommentModerationState | null, elapsedMs: number): boolean {
  if (!(elapsedMs >= 0 && elapsedMs < COMMENT_POLL_WINDOW_MS)) return false;
  return state === null || state === "pending";
}

// ─────────────────────────────────────────────────────────────────────────────
// D8/D9 — the flag sheet (§7.6, §10 "Flags")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D9's promise, from the server's `expectedWithin` rather than the reason just
 * picked: a repeated flag returns the *existing* flag (200), whose category —
 * and so whose promise — may differ from the one tapped this time.
 */
export function flagReceiptLine(expectedWithin: string | null | undefined): string {
  return expectedWithin === "within the hour"
    ? SAFETY_FLAG_LINE
    : "Flags like this are looked at within a day.";
}

/** D8's sub-copy: who reads it, what the author is told, and the safety promise. */
export function flagSheetIntro(kind: "report" | "comment"): string {
  const who = kind === "comment" ? "The person who posted the comment" : "The person who filed the report";
  return `A moderator reads every flag. ${who} is not told who flagged it. ${SAFETY_FLAG_LINE}`;
}

/** The hint on a safety row — the categories a moderator sees within the hour. */
export const SAFETY_ROW_HINT = "Looked at within the hour";

/**
 * What the sheet says when a flag fails. The server's own words where they are
 * the answer ("You can't flag your own report.", "That comment is not
 * available.", the rate limit), a plain retry line otherwise.
 */
export function flagErrorMessage(err: unknown): string {
  const info = errorInfo(err);
  if (info.offline) return "You're offline, so the flag was not sent. Try again when you're connected.";
  if (info.message && info.status !== null && info.status >= 400 && info.status < 500 && info.status !== 401) {
    return info.message;
  }
  return "That flag did not send. Try again.";
}

// ─────────────────────────────────────────────────────────────────────────────
// B3 — notifications (§7.7, §10 "Notifications")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * B3's empty state, naming the kinds the server actually sends (§7.7): report
 * news on the `status_change` kind, corroborations and replies, a removed
 * comment (`moderation_notice`) and urgent safety notices. No dispatch line —
 * dispatch is out of scope and nothing produces `dispatch_ready`.
 */
export const NOTIFICATIONS_EMPTY_BODY =
  "We only send a few kinds: news about your report — published, with a moderator, verified or dismissed — someone corroborating it or replying, a moderator removing one of your comments, and urgent safety notices for your area.";

/**
 * How many lines a row's body may take. Report news and moderation notices can
 * carry a reason, a moderator's note or crisis copy ("If you or someone else is
 * in danger right now…"), and none of that may be cut off mid-sentence.
 */
export function notificationBodyLines(type: string): number {
  return type === "status_change" || type === "moderation_notice" || type === "urgent_safety" ? 4 : 2;
}
