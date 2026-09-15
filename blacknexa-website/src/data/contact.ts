/**
 * The contact form's vocabulary.
 *
 * Lives here, apart from `lib/api/contact.ts`, because both a Client Component
 * (the form) and a server module (the API call) need it. Keeping it in the API
 * module would mean the form imported the transport layer to read a number —
 * which works only as long as the bundler tree-shakes it away. This boundary
 * does not depend on that.
 *
 * These values are also the server's: the subject keys match the API's enum and
 * the cap matches its validator, so anything the form accepts the API accepts.
 */

import type { SelectOption } from "@/components/ui/select";

/** Subject keys, exactly as the API's enum spells them. */
export const CONTACT_SUBJECTS = [
  "general",
  "partnership",
  "press",
  "problem",
  "legal",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** What the visitor picks from. Order is the dropdown's order. */
export const CONTACT_SUBJECT_OPTIONS: SelectOption[] = [
  { value: "general", label: "General enquiry" },
  { value: "partnership", label: "Partnership" },
  { value: "press", label: "Press" },
  { value: "problem", label: "Report a problem" },
  { value: "legal", label: "Legal" },
];

/** The subject used when none is chosen, and when an unknown one arrives. */
export const CONTACT_SUBJECT_DEFAULT: ContactSubject = "general";

/** Shortest message the form and the API will accept. */
export const CONTACT_MESSAGE_MIN = 12;

/** Longest. Mirrored onto the textarea, so the field simply stops accepting. */
export const CONTACT_MESSAGE_MAX = 5000;

/** Narrowing guard, so an unexpected value falls back rather than being forwarded. */
export function isContactSubject(value: unknown): value is ContactSubject {
  return typeof value === "string" && (CONTACT_SUBJECTS as readonly string[]).includes(value);
}
