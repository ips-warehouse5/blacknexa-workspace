/**
 * Contact-us inquiry types.
 *
 * The subject list is the marketing site's dropdown (`SUBJECT_OPTIONS` in
 * `blacknexa-website/src/components/forms/contact-form.tsx`), restated here
 * because the server validates against it. If the site adds an option, this is
 * the file that has to learn about it — an unknown subject is rejected rather
 * than stored, so a mismatch fails at submission instead of becoming a row the
 * console cannot filter.
 */

/** What the enquiry is about, as chosen on the site's form. */
export const CONTACT_SUBJECTS = [
  "general",
  "partnership",
  "press",
  "problem",
  "legal",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** Display names, used by the console and any future email copy. */
export const CONTACT_SUBJECT_LABELS: Record<ContactSubject, string> = {
  general: "General enquiry",
  partnership: "Partnership",
  press: "Press",
  problem: "Report a problem",
  legal: "Legal",
};

/**
 * Where an inquiry is in its handling.
 *
 * Deliberately a workflow rather than a read/unread flag: "someone opened it"
 * and "someone is dealing with it" are different facts, and a support queue that
 * cannot tell them apart loses enquiries to whoever clicked first.
 */
export const CONTACT_STATUSES = ["new", "in_progress", "resolved", "archived"] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  archived: "Archived",
};

/** Where the submission came from. Only the marketing site today. */
export type ContactSource = "website";

/**
 * An inquiry as the console sees it.
 *
 * `ipAddress` and `userAgent` are deliberately absent: they are recorded for
 * abuse investigation, not for the queue screen, and shipping them to every
 * operator who can read the list would be collecting them for one purpose and
 * using them for another.
 */
export interface ContactInquiryDto {
  id: string;
  name: string;
  email: string;
  subject: ContactSubject;
  subjectLabel: string;
  message: string;
  status: ContactStatus;
  source: ContactSource;
  submittedAt: string;
  /** Operator who last changed the status, and when. */
  handledBy: string | null;
  handledAt: string | null;
  internalNote: string | null;
}

/** Counts per status, for the console's KPI tiles. */
export type ContactSummary = Record<ContactStatus, number> & { total: number };
