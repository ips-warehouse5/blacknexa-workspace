/**
 * Report endpoints — the typed surface behind design sections B, C and D.
 *
 * Mirrors `src/types/report.interface.ts` on the server. Kept as a hand-written
 * mirror rather than generated, because the shapes are small and the comments
 * about *why* a field exists are worth more here than the guarantee they stay in
 * lockstep automatically.
 */

import api from "@/lib/api/client";

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
export type FlagReason =
  | "untrue"
  | "private_details"
  | "threatening"
  | "graphic"
  | "spam"
  | "other";

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
}

export interface StatusEventView {
  status: ReportStatus;
  at: string;
  actorLabel: string | null;
  note: string | null;
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
}

/** D2 — a separate screen, so a separate shape. */
export interface ReportOwnerView extends ReportDetailView {
  timeline: StatusEventView[];
  viewCount: number;
  moderatorCount: number;
  dispatchedTo: string[];
  canDispatch: boolean;
  exactLat: number | null;
  exactLng: number | null;
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
  type: "status_change" | "corroboration_or_reply" | "dispatch_ready" | "urgent_safety";
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

export interface FeedQuery {
  category?: ReportCategory;
  when?: "today" | "week" | "month" | "all";
  verifiedOnly?: boolean;
  urgentOnly?: boolean;
  sort?: "newest" | "supported" | "corroborated";
  cursor?: string;
  limit?: number;
  mine?: boolean;
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

  draftEvidence(draftId: string): Promise<EvidenceView[]> {
    return api.get(`/reports/drafts/${draftId}/evidence`);
  },

  discardDraft(draftId: string): Promise<null> {
    return api.delete(`/reports/drafts/${draftId}`);
  },

  // ── Filing (C7 → C9) ────────────────────────────────────────────────────

  file(draftId: string): Promise<{ reportId: string; caseRef: string; filedAt: string }> {
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

  flag(
    id: string,
    reason: FlagReason,
    note?: string,
  ): Promise<{ flagRef: string; authorIsTold: string; expectedWithin: string }> {
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

  flagComment(commentId: string, reason: FlagReason, note?: string): Promise<{ flagRef: string }> {
    return api.post(`/comments/${commentId}/flags`, { reason, note });
  },

  removeComment(commentId: string): Promise<null> {
    return api.delete(`/comments/${commentId}`);
  },

  // ── Notifications (B3) ──────────────────────────────────────────────────

  notifications(
    cursor?: string,
  ): Promise<{ items: NotificationView[]; nextCursor: string | null; unread: number }> {
    return api.get(`/notifications${qs({ cursor })}`);
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
