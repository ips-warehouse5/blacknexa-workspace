/**
 * Contact-us inquiry shapes.
 *
 * Mirrors `types/contact.interface.ts` on the server. The subject list is the
 * marketing site's form dropdown and the status list is the console's workflow;
 * both are unions rather than plain strings so that a filter or a badge for a
 * value the API cannot send is a compile error rather than an empty table.
 */

import type { BadgeTone } from "@/components/ui/Badge";

export const CONTACT_SUBJECTS = [
  "general",
  "partnership",
  "press",
  "problem",
  "legal",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

export const CONTACT_SUBJECT_LABELS: Record<ContactSubject, string> = {
  general: "General enquiry",
  partnership: "Partnership",
  press: "Press",
  problem: "Report a problem",
  legal: "Legal",
};

export const CONTACT_STATUSES = ["new", "in_progress", "resolved", "archived"] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  archived: "Archived",
};

/**
 * Which pill each status wears.
 *
 * Mapped rather than named directly, because the badge vocabulary is the
 * design's (`pending`, `verified`, …) and the workflow vocabulary is this
 * feature's. Keeping the translation in one table means restyling a status is
 * a one-line change here instead of a hunt through the page.
 */
export const CONTACT_STATUS_TONES: Record<ContactStatus, BadgeTone> = {
  new: "pending",
  in_progress: "under_review",
  resolved: "verified",
  archived: "deactivated",
};

export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  subject: ContactSubject;
  /** Server-rendered label, so the console and any email copy agree. */
  subjectLabel: string;
  message: string;
  status: ContactStatus;
  source: "website";
  submittedAt: string;
  /** Display name of the operator who last moved it, or null. */
  handledBy: string | null;
  handledAt: string | null;
  internalNote: string | null;
}

export type ContactStatusFilter = ContactStatus | "all";
export type ContactSubjectFilter = ContactSubject | "all";

export interface ContactListParams {
  page: number;
  limit: number;
  search: string;
  status: ContactStatusFilter;
  subject: ContactSubjectFilter;
}

/** Counts per status, plus the overall total, for the KPI tiles. */
export type ContactSummary = Record<ContactStatus, number> & { total: number };

export interface UpdateContactInput {
  status?: ContactStatus;
  /** An empty string clears the note; omitting the key leaves it untouched. */
  internalNote?: string;
}
