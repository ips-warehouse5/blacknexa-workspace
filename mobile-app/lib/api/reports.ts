/**
 * Report endpoints — the typed surface behind design sections B, C and D.
 *
 * Mirrors `src/types/report.interface.ts` on the server. Kept as a hand-written
 * mirror rather than generated, because the shapes are small and the comments
 * about *why* a field exists are worth more here than the guarantee they stay in
 * lockstep automatically.
 *
 * ── Revision 2: incident moderation (docs/INCIDENT_MODULE_PLAN.md §7.4) ────
 * Every field the moderation module added is mirrored here with the server's
 * name and optionality: the owner's `moderation` block and `moderationTimeline`,
 * the Vault card's `status` / `moderationState` / `displayStatus`, `flaggedByMe`,
 * and the comment and evidence states. The vocabulary those fields use — states,
 * display statuses, policy categories — is declared in `lib/report/moderation.ts`
 * (a leaf module, so it can be unit-tested without React Native) and re-exported
 * from here, so a screen imports its wire types from one place.
 */

import api from "@/lib/api/client";
import type {
  CommentModerationState,
  DisplayStatus,
  EvidenceModerationState,
  LegacyFlagCode,
  OwnerModerationEvent,
  PolicyCategory,
  ReportModerationState,
} from "@/lib/report/moderation";

export type {
  CommentModerationState,
  DisplayStatus,
  EvidenceModerationState,
  LegacyFlagCode,
  OwnerModerationEvent,
  PolicyCategory,
  ReportModerationState,
} from "@/lib/report/moderation";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** The nine categories on C1. `digital` and `other` are new in this design. */
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

export type ReportStatus = "draft" | "submitted" | "under_review" | "verified" | "dismissed";
export type TimePrecision = "exact" | "day_part" | "unknown";
export type DayPart = "morning" | "afternoon" | "evening" | "night";
export type EvidenceStrength = "thin" | "fair" | "strong" | "very_strong";
export type EvidenceKind = "photo" | "video" | "audio" | "document";
export type UploadState = "pending" | "uploaded" | "sealed" | "failed";
export type Visibility = "public" | "trusted" | "private";
export type LocationPrecision = "exact" | "approximate" | "hidden";
export type MatchedField = "title" | "description" | "area" | "category";

/**
 * A flag reason on the wire: one of the eight policy codes (D6/D7), or one of the
 * three codes the old flag sheet sent, which the server still accepts and
 * normalises. New code sends policy codes only — see `REPORT_FLAG_OPTIONS`.
 */
export type FlagReason = PolicyCategory | LegacyFlagCode;

/**
 * Notification kinds. `moderation_notice` is "Your comment was removed" — a
 * moderation outcome about something that is not a report status (D18).
 */
export type NotificationType =
  | "status_change"
  | "corroboration_or_reply"
  | "dispatch_ready"
  | "urgent_safety"
  | "moderation_notice";

// ─────────────────────────────────────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthorView {
  name: string;
  initials: string | null;
  anonymous: boolean;
}

export interface LocationView {
  precision: LocationPrecision;
  label: string | null;
  lat: number | null;
  lng: number | null;
  radiusMetres: number | null;
}

export interface EvidenceView {
  id: string;
  kind: EvidenceKind;
  mime: string;
  bytes: number;
  durationMs: number | null;
  capturedAt: string | null;
  /** The server's hash-on-arrival stamp. Null until sealed. */
  sealedAt: string | null;
  uploadState: UploadState;
  url: string | null;
  thumbUrl: string | null;
  /**
   * D22. On the owner's own files only — a viewer is only ever sent approved
   * files, so for them it is omitted.
   */
  moderationState?: EvidenceModerationState;
  /**
   * A file a viewer may know exists but not open yet: listed without URLs, drawn
   * as "Awaiting review" (§7.3). Omitted means false.
   */
  pendingReview?: boolean;
  /**
   * A viewer's copy of a file whose approval covered only its sealed preview
   * (review R5): `thumbUrl` is set, `url` stays null until a moderator clears the
   * original. Omitted means false. Owners always get both URLs.
   */
  fullResolutionPending?: boolean;
}

export interface StatusEventView {
  status: ReportStatus;
  at: string;
  actorLabel: string | null;
  note: string | null;
  /**
   * Set on `ReportOwnerView.moderationTimeline` nodes only: which owner-safe
   * moderation event this is. `status` then carries the case status at that
   * moment.
   */
  moderationEvent?: OwnerModerationEvent;
  /** The author-visible reason (reject, deactivate or dismiss), when there is one. */
  reasonLabel?: string | null;
}

/**
 * The owner's view of the publication axis (§7.4). `reasonCode`, `reasonLabel`
 * and `note` are sent only while the report is rejected or taken down — hold
 * reasons are staff-only.
 */
export interface OwnerModerationView {
  state: ReportModerationState;
  displayStatus: DisplayStatus;
  reasonCode?: string | null;
  reasonLabel?: string | null;
  note?: string | null;
  /**
   * Sent only while the report is rejected: how many more *Edit and resubmit*
   * attempts the server accepts before it answers 409 "Contact support" (D19).
   * At 0 D2 stops offering the action (§10 "hidden after 3"). A server older
   * than this field omits it, and the 409 is then the only signal.
   */
  resubmissionsLeft?: number;
  /** When the current state was reached, or null if never moderated. */
  at: string | null;
}

/**
 * What the 1a feed card renders.
 *
 * `leadMedia` decides the card variant, and it arrives with the row precisely so
 * the card can pick its height before first paint — see the screens plan §3.3.
 */
export interface FeedCardView {
  id: string;
  caseRef: string;
  title: string;
  excerpt: string;
  category: ReportCategory;
  urgent: boolean;
  verified: boolean;
  visibility: Visibility;
  occurredAt: string;
  filedAt: string;
  author: AuthorView;
  areaLabel: string | null;
  supportCount: number;
  commentCount: number;
  leadMedia: {
    kind: EvidenceKind;
    thumbUrl: string | null;
    posterUrl: string | null;
    durationMs: number | null;
  } | null;
  mediaCount: number;
  standingWith: boolean;
  /**
   * The Vault's own fields (`mine=true` only, §7.4). `verified` alone cannot tell
   * checking, held, rejected or dismissed apart.
   */
  status?: ReportStatus;
  moderationState?: ReportModerationState;
  displayStatus?: DisplayStatus;
}

export interface ReportDetailView {
  id: string;
  caseRef: string;
  title: string;
  body: string;
  category: ReportCategory;
  status: ReportStatus;
  urgent: boolean;
  visibility: Visibility;
  occurredAt: string;
  occurredPrecision: TimePrecision;
  occurredDayPart: DayPart | null;
  filedAt: string;
  author: AuthorView;
  location: LocationView;
  evidence: EvidenceView[];
  supportCount: number;
  commentCount: number;
  corroborationCount: number;
  evidenceStrength: EvidenceStrength;
  standingWith: boolean;
  corroborated: boolean;
  isOwner: boolean;
  /** True when the caller has an open flag on this report — "You flagged this" (§10). */
  flaggedByMe?: boolean;
}

/** D2 — a separate screen, so a separate shape. */
export interface ReportOwnerView extends ReportDetailView {
  /** Case-status events only — one row per status. */
  timeline: StatusEventView[];
  /**
   * The owner-safe moderation events (published, with a moderator, not
   * published, taken down, live again), ascending, each carrying
   * `moderationEvent`. Merge with `timeline` by `at` to draw one history.
   */
  moderationTimeline: StatusEventView[];
  viewCount: number;
  moderatorCount: number;
  dispatchedTo: string[];
  canDispatch: boolean;
  exactLat: number | null;
  exactLng: number | null;
  /** The publication axis and what the author may be told about it (§7.4). */
  moderation?: OwnerModerationView;
}

export interface TrustView {
  verifiedAt: string | null;
  verifiedBy: string | null;
  files: { id: string; label: string; unchanged: boolean }[];
  provenance: StatusEventView[];
  strength: EvidenceStrength;
  rationale: string;
}

export interface CommentView {
  id: string;
  parentId: string | null;
  author: AuthorView;
  body: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  replies?: CommentView[];
  /**
   * The caller's own comments only: "Checking…", "Held for review", "Removed by
   * a moderator" (§7.4). Never sent for someone else's comment.
   */
  moderationState?: CommentModerationState;
  /** True when the caller wrote it — D4's delete-own affordance. */
  isMine?: boolean;
}

export interface FeedFacets {
  total: number;
  categories: { category: ReportCategory; count: number }[];
  when: { today: number; week: number; month: number; all: number };
  verified: number;
  urgent: number;
}

export interface SearchResultView extends FeedCardView {
  matchedIn: MatchedField;
  snippet: string | null;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft
// ─────────────────────────────────────────────────────────────────────────────

/** The wizard's accumulated state. Every field optional — steps fill it in turn. */
export interface DraftPayload {
  category?: ReportCategory;
  title?: string;
  body?: string;
  occurredAt?: string;
  occurredPrecision?: TimePrecision;
  occurredDayPart?: DayPart;
  happeningNow?: boolean;
  locationPrecision?: LocationPrecision;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  visibility?: Visibility;
  anonymous?: boolean;
  urgent?: boolean;
}

export interface DraftSummary {
  id: string;
  step: number;
  payload: DraftPayload;
  updatedAt: string;
  evidenceCount: number;
}

/**
 * C9's receipt. `POST /reports` answers 201 with it for a new report — and 200
 * with the *same* receipt when the draft had already been filed (D12), so a
 * retry after a lost response lands on C9 rather than on an error.
 */
export interface FilingReceipt {
  reportId: string;
  caseRef: string;
  filedAt: string;
  /** What C9's stepper shows first. */
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
}

/** D9's confirmation, for a report or a comment flag (§7.6). */
export interface FlagReceipt {
  flagRef: string;
  authorIsTold: string;
  expectedWithin: "within the hour" | "within a day";
}

export interface FeedQuery {
  category?: ReportCategory;
  when?: "today" | "week" | "month" | "all";
  verifiedOnly?: boolean;
  urgentOnly?: boolean;
  sort?: "newest" | "supported" | "corroborated";
  cursor?: string;
  limit?: number;
  mine?: boolean;
  /** The Vault's chip filter. Only meaningful with `mine` (§7.4). */
  displayStatus?: DisplayStatus;
}

/** Drop undefined keys so they do not become the string "undefined". */
function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export const reportsApi = {
  // ── Drafts (C1–C7, C10, C11) ────────────────────────────────────────────

  saveDraft(
    step: number,
    payload: DraftPayload,
    draftId?: string,
  ): Promise<{ draftId: string; updatedAt: string }> {
    return api.post("/reports/drafts", { draftId, step, payload });
  },

  listDrafts(): Promise<DraftSummary[]> {
    return api.get("/reports/drafts");
  },

  /**
   * Every file on one of the caller's own drafts, sealed or not — how a resumed
   * draft rebuilds C5's list, and how the wizard reconciles its files with the
   * server before filing. 404 for a draft that is gone or not the caller's.
   */
  draftEvidence(draftId: string): Promise<EvidenceView[]> {
    return api.get(`/reports/drafts/${encodeURIComponent(draftId)}/evidence`);
  },

  discardDraft(draftId: string): Promise<null> {
    return api.delete(`/reports/drafts/${draftId}`);
  },

  // ── Filing (C7 → C9) ────────────────────────────────────────────────────

  /**
   * File a draft. Safe to repeat: a draft that was already filed answers with the
   * report it became (200) instead of a second report (D12), and a draft that
   * does not exist answers 404 without creating anything.
   */
  file(draftId: string): Promise<FilingReceipt> {
    // `attested` is always true here: the wizard will not call this until C7's
    // checkbox is ticked, and the server rejects a literal false.
    return api.post("/reports", { draftId, attested: true });
  },

  // ── Evidence (C5) ───────────────────────────────────────────────────────

  presignEvidence(input: {
    kind: EvidenceKind;
    mime: string;
    bytes: number;
    durationMs?: number;
    capturedAt?: string;
    draftId?: string;
    reportId?: string;
  }): Promise<{
    evidenceId: string;
    uploadUrl: string;
    headers: Record<string, string>;
    /** Second slot for a device-generated preview. Null for audio and documents. */
    thumbUploadUrl: string | null;
    thumbHeaders: Record<string, string> | null;
  }> {
    return api.post("/reports/evidence/presign", input);
  },

  commitEvidence(
    evidenceId: string,
    input: {
      sha256: string;
      capturedAt?: string;
      durationMs?: number;
      /** True when a preview was PUT to the second slot. Outside the seal. */
      thumbUploaded?: boolean;
    },
  ): Promise<EvidenceView> {
    return api.post(`/reports/evidence/${evidenceId}/commit`, input);
  },

  removeEvidence(evidenceId: string): Promise<null> {
    return api.delete(`/reports/evidence/${evidenceId}`);
  },

  // ── Feed (B1–B7) ────────────────────────────────────────────────────────

  feed(query: FeedQuery = {}): Promise<{ items: FeedCardView[]; nextCursor: string | null }> {
    return api.get(`/reports${qs(query as Record<string, string | number | boolean | undefined>)}`);
  },

  facets(query: FeedQuery = {}): Promise<FeedFacets> {
    return api.get(
      `/reports/facets${qs(query as Record<string, string | number | boolean | undefined>)}`,
    );
  },

  search(
    term: string,
    query: FeedQuery = {},
  ): Promise<{ items: SearchResultView[]; suggestion: string | null }> {
    return api.get(
      `/reports/search${qs({ ...(query as Record<string, string | number | boolean | undefined>), q: term })}`,
    );
  },

  // ── Detail (D1–D3) ──────────────────────────────────────────────────────

  /**
   * One endpoint, two shapes.
   *
   * The server returns the owner projection to the owner and the viewer
   * projection to everyone else, so the caller checks `isOwner` to decide which
   * screen to render rather than asking twice.
   */
  detail(idOrRef: string): Promise<ReportDetailView | ReportOwnerView> {
    return api.get(`/reports/${encodeURIComponent(idOrRef)}`);
  },

  trust(idOrRef: string): Promise<TrustView> {
    return api.get(`/reports/${encodeURIComponent(idOrRef)}/trust`);
  },

  update(id: string, patch: { title?: string; body?: string }): Promise<ReportOwnerView> {
    return api.patch(`/reports/${id}`, patch);
  },

  remove(id: string): Promise<{ reportId: string }> {
    return api.delete(`/reports/${id}`);
  },

  // ── Social (D1, D8–D10) ─────────────────────────────────────────────────

  toggleSupport(id: string): Promise<{ standing: boolean; count: number }> {
    return api.post(`/reports/${id}/support`);
  },

  corroborate(id: string, note?: string): Promise<{ count: number }> {
    return api.post(`/reports/${id}/corroborate`, { note });
  },

  /** Idempotent: flagging the same report again returns the existing flag (200). */
  flag(id: string, reason: FlagReason, note?: string): Promise<FlagReceipt> {
    return api.post(`/reports/${id}/flags`, { reason, note });
  },

  hide(id: string): Promise<null> {
    return api.post(`/reports/${id}/hide`);
  },

  shareLink(id: string): Promise<{
    url: string;
    caseRef: string;
    recipientSees: { authorName: boolean; exactLocation: boolean; thatYouShared: boolean };
  }> {
    return api.post(`/reports/${id}/share-link`);
  },

  // ── Comments (D4–D7) ────────────────────────────────────────────────────

  comments(
    idOrRef: string,
    sort: "top" | "new" = "top",
    cursor?: string,
  ): Promise<{ items: CommentView[]; nextCursor: string | null; total: number }> {
    return api.get(`/reports/${encodeURIComponent(idOrRef)}/comments${qs({ sort, cursor })}`);
  },

  createComment(
    idOrRef: string,
    body: string,
    parentId?: string,
    anonymous = false,
  ): Promise<CommentView> {
    return api.post(`/reports/${encodeURIComponent(idOrRef)}/comments`, {
      body,
      parentId,
      anonymous,
    });
  },

  likeComment(commentId: string): Promise<{ liked: boolean; count: number }> {
    return api.post(`/comments/${commentId}/like`);
  },

  /** The comment sheet's six categories (§3.1). Idempotent, like `flag`. */
  flagComment(commentId: string, reason: FlagReason, note?: string): Promise<FlagReceipt> {
    return api.post(`/comments/${commentId}/flags`, { reason, note });
  },

  /** The author's own comment only, in any moderation state (§7.5). */
  removeComment(commentId: string): Promise<null> {
    return api.delete(`/comments/${commentId}`);
  },

  // ── Notifications (B3) ──────────────────────────────────────────────────

  /** `unread` counts the whole account, not the page — the feed bell's dot reads it. */
  notifications(
    cursor?: string,
    limit?: number,
  ): Promise<{ items: NotificationView[]; nextCursor: string | null; unread: number }> {
    return api.get(`/notifications${qs({ cursor, limit })}`);
  },

  markAllRead(): Promise<{ updated: number }> {
    return api.post("/notifications/read-all");
  },
};

export default reportsApi;

// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** C1's nine rows, with the one-liner that says what each word covers. */
export const CATEGORY_META: Record<
  ReportCategory,
  { label: string; hint: string; token: "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8" | "c9" }
> = {
  policing: { label: "Policing", hint: "A stop, a search, an arrest, force", token: "c1" },
  profiling: {
    label: "Profiling",
    hint: "Being followed, watched or refused service",
    token: "c2",
  },
  housing: { label: "Housing", hint: "A landlord, a rental, an eviction", token: "c3" },
  workplace: { label: "Workplace", hint: "Hiring, pay, promotion, retaliation", token: "c4" },
  education: { label: "Education", hint: "A school, a teacher, discipline", token: "c5" },
  medical: { label: "Medical", hint: "Care refused, dismissed or delayed", token: "c6" },
  digital: { label: "Digital", hint: "Online abuse, doxxing, account action", token: "c7" },
  harassment: { label: "Harassment", hint: "Threats, slurs, following, contact", token: "c8" },
  other: { label: "Other", hint: "None of these fit", token: "c9" },
};

export const CATEGORY_ORDER: ReportCategory[] = [
  "policing",
  "profiling",
  "housing",
  "workplace",
  "education",
  "medical",
  "digital",
  "harassment",
  "other",
];

/** "2h ago", "Yesterday", "13 Aug" — the feed and detail timestamp format. */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "13 Aug 2026, 7:22 PM" — the occurred/filed pair on C3, C9 and D1. */
export function absoluteTime(iso: string): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return "";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "24.8 MB" for C5's rows and C9's sealed list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "0:42" for a video or audio duration. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
