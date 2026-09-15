/**
 * Types for the prototype fixtures.
 *
 * These describe the data the approved prototype ships with, field for field.
 * They are deliberately exact rather than permissive — no index signatures —
 * because the point of typing a fixture is to find out at compile time when a
 * screen reads a field that does not exist.
 *
 * Where the fixture uses a preformatted date string ("Aug 27, 2026  09:41 AM")
 * that is kept, because the design shows dates in exactly that form and
 * round-tripping them through Date only to format them back would introduce
 * timezone drift for no gain.
 */

// ── Moderation queue ────────────────────────────────────────────────────────

export type ModerationItemType = "Incident" | "Comment" | "Profile";

/** A user report against a post: who reported it, why, and when. */
export type UserFlag = [reporter: string, reason: string, at: string];

/** An AI detection: the rule that matched, and the text that triggered it. */
export type AiFlag = [rule: string, matchedText: string];

export interface ModerationPost {
  id: string;
  type: ModerationItemType;
  title: string;
  /** Present on comments — the incident whose thread this belongs to. */
  parentIncident?: string;
  user: string;
  category: string;
  status: string;
  location: string;
  urgent: boolean;
  submitted: string;
  content: string;
  evidence: string[];
  /** Absent when nothing was machine-flagged. */
  ai?: AiFlag[];
  reports: UserFlag[];
}

export interface KeywordRule {
  title: string;
  type: string;
  source: string;
  /** Comma-separated terms, as the design displays and edits them. */
  pattern: string;
  detected: number;
}

// ── Incidents ───────────────────────────────────────────────────────────────

/** Status labels exactly as the fixture and the design badges spell them. */
export type IncidentStatus =
  | "Submitted"
  | "Under Review"
  | "Verified"
  | "Dismissed"
  | "Deactivated";

/** Evidence attached to an incident. `meta` is a preformatted summary line. */
export interface IncidentEvidence {
  /** Short kind marker shown on the tile: IMG, PDF, AUD, VID. */
  type: string;
  name: string;
  meta: string;
}

export interface IncidentNote {
  author: string;
  date: string;
  text: string;
}

export interface Incident {
  id: string;
  title: string;
  author: string;
  category: string;
  status: IncidentStatus;
  /** Who can see the incident on the public side: Public, Trusted, Private. */
  visibility: string;
  location: string;
  submitted: string;
  /** The reporter's account, in their own words. */
  story: string;
  /** Display name of the assignee, or "Unassigned". */
  assignee: string;
  /** Present once assigned. */
  assignedRole?: string;
  assignedAt?: string;
  evidence: IncidentEvidence[];
  notes: IncidentNote[];
}

// ── Users ───────────────────────────────────────────────────────────────────

export type AppUserRole = "member" | "advocate" | "moderator";
export type AppUserStatus = "active" | "suspended" | "deleted";

/** An incident as summarised on a user's profile. */
export interface UserIncidentSummary {
  id: string;
  title: string;
  category: string;
  status: string;
  submitted: string;
}

export interface AppUser {
  id: string;
  display_name: string;
  email: string;
  email_verified_at: string | null;
  role: AppUserRole;
  region: string;
  tier: string;
  status: AppUserStatus;
  avatar_mode: string;
  default_visibility: string;
  default_precision: string;
  anonymous_by_default: boolean;
  notifications_enabled: boolean;
  created_at: string;
  last_login_at: string;
  /** Internal moderator note about the account. */
  notes: string;
  incidents: UserIncidentSummary[];
}

// ── Resources ───────────────────────────────────────────────────────────────

export interface DirectoryResource {
  id: string;
  name: string;
  category: string;
  description: string;
  contact: string;
  /** How far the organisation operates: National, Regional, Local. */
  reach: string;
  /** Prose description of coverage, e.g. "United States (Nationwide)". */
  regionsServed: string;
  tags: string[];
  status: string;
  verified: boolean;
  author: string;
  createdDate: string;
}

// ── News ────────────────────────────────────────────────────────────────────

/** One cited source behind a story. */
export interface NewsSource {
  name: string;
  url: string;
  credibility: string;
}

export interface NewsStory {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  /** Reach of the story: Global, National, Local. */
  scope: string;
  location: string;
  status: string;
  language: string;
  languageLabel: string;
  publishedDate: string;
  image: string;
  /** Sources the story was assembled from, with their credibility rating. */
  sources: NewsSource[];
  verified: boolean;
  seoIndexed: boolean;
  /** Body length, used by the list view. */
  chars: number;
  /** Whether the story is in the daily briefing. */
  dailyBriefing: boolean;
  audioStatus: string;
  audioUrl: string;
  audioVoice: string;
  audioDuration: string;
}

// ── Content ─────────────────────────────────────────────────────────────────

export interface EducationalArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  status: string;
  updated: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  status: string;
  updated: string;
}

export interface LegalDocumentSection {
  heading: string;
  body: string;
}

export interface LegalDocument {
  title: string;
  version: string;
  updated: string;
  /** Contact line printed under the document. */
  footer: string;
  sections: LegalDocumentSection[];
}

// ── Notifications ───────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  /** Where it was delivered: Push, In-App, Email. */
  channel: string;
  status: string;
  targetRegion: string;
  targetRole: string;
  targetTier: string;
  reachEstimate: number;
  deliveredCount: number;
  openedCount: number;
  /** Preformatted for display, e.g. "71.6%". */
  openRate: string;
  sentAt: string;
  author: string;
  /** Set when the announcement links to a news story. */
  articleId: string | null;
}

export interface NewsNotification {
  id: string;
  headline: string;
  summary: string;
  articleId: string;
  deepLink: string;
  status: string;
  targetRegion: string;
  targetRole: string;
  targetTier: string;
  sentCount: number;
  openCount: number;
  /** Preformatted for display, e.g. "64.2%". */
  openRate: string;
  sentAt: string;
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface IncidentCategory {
  id: string;
  name: string;
  status: "active" | "inactive";
}
