/**
 * Report module types — design sections C (wizard) and D (detail).
 *
 * ── Two invariants these types exist to protect ─────────────────────────────
 *
 * 1. **`user_id` is never in a response.** The wire types below have no owner
 *    field at all, so a projection cannot leak one by omission. Authorship is
 *    expressed as an already-resolved `author` block that is either a name or the
 *    word "Anonymous".
 *
 * 2. **Exact coordinates are never in a viewer's response.** `LocationView`
 *    carries only what the chosen precision permits, and the exact value lives in
 *    a separate sealed column the viewer projection never reads.
 *
 * ── Revision 2: incident moderation ─────────────────────────────────────────
 * Every wire field the moderation module adds (docs/INCIDENT_MODULE_PLAN.md
 * §7.4 — the owner's `moderation` block, the Vault card's `displayStatus`,
 * `flaggedByMe`, comment and evidence moderation states) is **optional**, and
 * `FlagReason` still accepts the three codes the shipped flag sheet sends, so
 * the mobile client in the stores keeps working against the new server. The
 * shared vocabulary itself — policy categories, states, reasons, the display
 * table — lives in `moderation.interface.ts`.
 */

import type { LocationPrecision, Visibility } from "@/types/user.interface";
import {
  ALL_LEGACY_FLAG_CODES,
  COMMENT_FLAG_CATEGORIES,
  POLICY_CATEGORIES,
  type AiReportCategory,
  type CommentModerationState,
  type DisplayStatus,
  type EvidenceModerationState,
  type LegacyFlagCode,
  type OwnerModerationEvent,
  type OwnerModerationView,
  type PolicyCategory,
  type ReportModerationState,
} from "@/types/moderation.interface";

/** The nine categories on screen C1. `digital` and `other` are new. */
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

/**
 * Display names for the nine categories.
 *
 * Normally the wire carries the id and the client owns the label — but the shared
 * report page is server-rendered, so the server needs the words too. Kept next to
 * the union so a new category cannot be added without a name for it.
 */
export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  policing: "Policing",
  profiling: "Profiling",
  housing: "Housing",
  workplace: "Workplace",
  education: "Education",
  medical: "Medical",
  digital: "Digital",
  harassment: "Harassment",
  other: "Other",
};

export const ALL_REPORT_CATEGORIES: ReportCategory[] = [
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

/**
 * `moderation.interface.ts` restates the nine categories for the AI contract
 * because it may import nothing. These two assignments fail to compile the
 * moment either list gains or loses a member, so the copies cannot drift.
 */
const _categoriesMatchAiContract: AiReportCategory = "other" as ReportCategory;
const _aiContractMatchesCategories: ReportCategory = "other" as AiReportCategory;
void _categoriesMatchAiContract;
void _aiContractMatchesCategories;

/**
 * The five statuses, and no more.
 *
 * Screen A11 names exactly four post-draft states — "Submitted, under review,
 * verified or dismissed" — so inventing a `needs_info` would be inventing a
 * notification the app has promised not to send.
 */
export type ReportStatus = "draft" | "submitted" | "under_review" | "verified" | "dismissed";

export const REVIEWABLE_STATUSES: ReportStatus[] = ["submitted", "under_review"];

/** Terminal outcomes a moderator can set. */
export type ModerationOutcome = "under_review" | "verified" | "dismissed";

/** How precisely the occurred-at time is known — screen C3. */
export type TimePrecision = "exact" | "day_part" | "unknown";

/** C3's "I'm not sure of the time" replacement values. */
export type DayPart = "morning" | "afternoon" | "evening" | "night";

/** The four bands on the D3 evidence-strength scale. */
export type EvidenceStrength = "thin" | "fair" | "strong" | "very_strong";

/** Attachment kinds offered on C5. */
export type EvidenceKind = "photo" | "video" | "audio" | "document";

export const ALL_EVIDENCE_KINDS: EvidenceKind[] = ["photo", "video", "audio", "document"];

/** Where a file is in the lifecycle described in the feature plan §6.3. */
export type UploadState = "pending" | "uploaded" | "sealed" | "failed";

/**
 * A flag reason as it arrives on the wire: one of the eight policy codes
 * (D6/D7), or one of the three codes the old D8 sheet sent. Shipped clients keep
 * working; the flag service normalises with `normaliseFlagCategory` before
 * anything is stored, and readers normalise rows written before revision 2.
 */
export type FlagReason = PolicyCategory | LegacyFlagCode;

/** Every accepted report-flag input: the eight canonical codes, then the three legacy ones. */
export const ALL_FLAG_REASONS: FlagReason[] = [...POLICY_CATEGORIES, ...ALL_LEGACY_FLAG_CODES];

/**
 * Accepted comment-flag inputs: the six comment categories (§3.1) plus the two
 * legacy codes that map into them. `untrue` maps to `misleading`, which a
 * comment cannot carry, so it is not accepted here.
 */
export const ALL_COMMENT_FLAG_REASONS: FlagReason[] = [
  ...COMMENT_FLAG_CATEGORIES,
  "threatening",
  "private_details",
];

/**
 * Notification kinds. A11 named the first four; `moderation_notice` is D18's
 * "Your comment was removed" — a moderation outcome about something that is not
 * a report status, so it is not squeezed into `status_change`.
 */
export type NotificationType =
  | "status_change"
  | "corroboration_or_reply"
  | "dispatch_ready"
  /** Ignores preferences. Enforced server-side, never by the client. */
  | "urgent_safety"
  | "moderation_notice";

// ─────────────────────────────────────────────────────────────────────────────
// Wire shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Author, already resolved for display. Carries no id — see the file header. */
export interface AuthorView {
  /** A display name, or "Anonymous". */
  name: string;
  /** Two letters for the avatar tile, or null when anonymous. */
  initials: string | null;
  anonymous: boolean;
}

/** Location, reduced to what the chosen precision permits. */
export interface LocationView {
  precision: LocationPrecision;
  /** "Brownsville, Brooklyn". Always safe to show. */
  label: string | null;
  /**
   * Rounded coordinates. Null when precision is `hidden` — and null means the
   * map renders its blurred variant, not that the data is missing.
   */
  lat: number | null;
  lng: number | null;
  /** Radius in metres the rounding implies, for the D1 map circle. */
  radiusMetres: number | null;
}

/** One attached file, as C5, C9, D1, D11 and D12 all render it. */
export interface EvidenceView {
  id: string;
  kind: EvidenceKind;
  mime: string;
  bytes: number;
  durationMs: number | null;
  capturedAt: string | null;
  /** The server's hash-on-arrival timestamp. Null while still uploading. */
  sealedAt: string | null;
  uploadState: UploadState;
  /** Short-lived presigned URLs, minted per request. */
  url: string | null;
  thumbUrl: string | null;
  /**
   * D22. Present on the owner's own view (and to staff). Non-owners are only
   * ever sent approved files, so for them it is omitted.
   */
  moderationState?: EvidenceModerationState;
  /**
   * True for a file a non-owner may know exists but may not open yet — listed
   * as "Awaiting review" without URLs (§7.3). Omitted means false.
   */
  pendingReview?: boolean;
  /**
   * True for a non-owner's view of an approved file whose approval covered only
   * its sealed preview (D22, review R5): `thumbUrl` is set, `url` is null until
   * the original is approved too. Omitted means false. Owners and staff always
   * get both URLs.
   */
  fullResolutionPending?: boolean;
}

/** One node on the D2 timeline. */
export interface StatusEventView {
  status: ReportStatus;
  at: string;
  /** "by a moderator" on D2, or null for a system transition. */
  actorLabel: string | null;
  note: string | null;
  /**
   * Set on the nodes of `ReportOwnerView.moderationTimeline` only: an owner-safe
   * moderation event (published, with a moderator, not published, taken down,
   * live again — §7.4). `status` then carries the case status at that moment.
   * Never set on a `timeline` node — see `ReportOwnerView.moderationTimeline`.
   */
  moderationEvent?: OwnerModerationEvent;
  /** Author-visible reason label (reject, deactivate or dismiss), when there is one. */
  reasonLabel?: string | null;
}

/** What the 1a feed card needs, and nothing more. */
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
  /**
   * Chooses the card variant. Null means the text-first card, which the design
   * never draws but which 1a forces — see the screens plan §3.3.
   */
  leadMedia: {
    kind: EvidenceKind;
    thumbUrl: string | null;
    posterUrl: string | null;
    durationMs: number | null;
  } | null;
  /** Total attachments. The card shows `mediaCount - 1` as "+N files". */
  mediaCount: number;
  /** True when the caller has already stood with it. */
  standingWith: boolean;
  /**
   * Owner-only (the Vault, `mine=true`) — §7.4. The card previously carried only
   * `verified`, which cannot tell submitted, under review or dismissed apart.
   */
  status?: ReportStatus;
  moderationState?: ReportModerationState;
  displayStatus?: DisplayStatus;
}

/** D1 — the community viewer's projection. */
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
  /** True when the caller filed it — the client uses this to route to D2. */
  isOwner: boolean;
  /** True when the caller has an open flag on this report — "You flagged this" (§10). */
  flaggedByMe?: boolean;
}

/** D2 — everything the viewer projection has, plus what only the owner sees. */
export interface ReportOwnerView extends ReportDetailView {
  /** Case-status events only — what the shipped D2 renders, one row per status. */
  timeline: StatusEventView[];
  /**
   * Additive (§7.4, review R14): the owner-safe moderation events, each carrying
   * `moderationEvent`, in ascending order. Kept out of `timeline` because the
   * shipped D2 renders `STATUS_LABEL[event.status]` and ignores
   * `moderationEvent`, so every moderation node there showed as a second
   * "Submitted" row. A client that understands both merges them by `at`.
   */
  moderationTimeline: StatusEventView[];
  viewCount: number;
  moderatorCount: number;
  /** D2's "Outside organisations: None" until a dispatch happens. */
  dispatchedTo: string[];
  /** D2 gates "Start a dispatch" on this. */
  canDispatch: boolean;
  /** Exact coordinates, released only here. */
  exactLat: number | null;
  exactLng: number | null;
  /** The publication axis and what the author may be told about it (§7.4). */
  moderation?: OwnerModerationView;
}

/** D3 — the trust sheet. */
export interface TrustView {
  verifiedAt: string | null;
  verifiedBy: string | null;
  files: { id: string; label: string; unchanged: boolean }[];
  provenance: StatusEventView[];
  strength: EvidenceStrength;
  /** The plain-English justification sentence D3 prints under the scale. */
  rationale: string;
}

/** One comment, two levels only — D4. */
export interface CommentView {
  id: string;
  parentId: string | null;
  author: AuthorView;
  body: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  /** Present on root comments only. */
  replies?: CommentView[];
  /**
   * The caller's own comments only (§7.4): "Checking…", "Held for review",
   * "Removed by a moderator". Never sent for someone else's comment.
   */
  moderationState?: CommentModerationState;
  /** True when the caller wrote it. */
  isMine?: boolean;
}

/** B1 and B2's live counts. */
export interface FeedFacets {
  total: number;
  categories: { category: ReportCategory; count: number }[];
  when: { today: number; week: number; month: number; all: number };
  verified: number;
  urgent: number;
}

/** B5's per-row "MATCHED IN …" label. */
export type MatchedField = "title" | "description" | "area" | "category";

export interface SearchResultView extends FeedCardView {
  matchedIn: MatchedField;
  /** The surrounding words, for a description match. */
  snippet: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────────────

/** The wizard's accumulated state, saved on every step. */
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

export interface SaveDraftDto {
  draftId?: string;
  /** 1–7, so the wizard can resume on the step it left. */
  step: number;
  payload: DraftPayload;
}

export interface FileReportDto {
  draftId: string;
  /** C7's attestation. Refused without it. */
  attested: boolean;
}

export interface PresignEvidenceDto {
  kind: EvidenceKind;
  mime: string;
  bytes: number;
  durationMs?: number;
  capturedAt?: string;
}

export interface CommitEvidenceDto {
  /** Hex SHA-256 the client computed. Verified against the stored object. */
  sha256: string;
  capturedAt?: string;
  durationMs?: number;
  /**
   * True when the client also PUT a preview image to the second presigned slot.
   *
   * Deliberately outside the seal: the hash covers the original, so a wrong value
   * here costs a missing preview and never a false integrity claim.
   */
  thumbUploaded?: boolean;
}

export interface CreateCommentDto {
  body: string;
  parentId?: string;
  anonymous?: boolean;
}

export interface CreateFlagDto {
  reason: FlagReason;
  note?: string;
}

export interface FeedQuery {
  category?: ReportCategory;
  when?: "today" | "week" | "month" | "all";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  verifiedOnly?: boolean;
  urgentOnly?: boolean;
  sort?: "newest" | "supported" | "corroborated";
  cursor?: string;
  limit?: number;
  mine?: boolean;
  /** Vault chip filter; only meaningful with `mine` (§7.4). */
  displayStatus?: DisplayStatus;
}
