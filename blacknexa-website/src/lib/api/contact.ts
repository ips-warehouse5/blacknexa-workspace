/**
 * Contact-us endpoints.
 *
 * The path and the payload shape live here rather than in the route handler,
 * so when the API changes there is one file to edit and it is named after the
 * thing that changed. The subject keys and length limits are shared with the
 * form and live in `@/data/contact`.
 */

import { apiPost } from "@/lib/api/client";
import type { ContactSubject } from "@/data/contact";

export interface ContactSubmission {
  name: string;
  email: string;
  subject: ContactSubject;
  message: string;
}

/** What the API returns. Deliberately not the stored row — just a receipt. */
export interface ContactReceipt {
  id: string;
  submittedAt: string;
}

/** `POST /contact` — file an enquiry from the website's contact form. */
export function submitContactInquiry(input: ContactSubmission): Promise<ContactReceipt> {
  return apiPost<ContactReceipt>("/contact", input);
}
