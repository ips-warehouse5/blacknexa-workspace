/**
 * Waitlist endpoints.
 *
 * **The backend endpoint does not exist yet.** The call is written out so the
 * shape is settled and the route handler reads like every other one, but
 * `WAITLIST_ENDPOINT_READY` gates it: while that is false the route says the
 * signup is not open rather than posting into a 404 and telling the visitor
 * something went wrong on our end.
 *
 * To turn it on: ship `POST /waitlist` on the API, flip the flag, delete this
 * paragraph.
 */

import { apiPost } from "@/lib/api/client";

/** Flip once `POST /waitlist` exists on the API. */
export const WAITLIST_ENDPOINT_READY = false;

export interface WaitlistSignup {
  email: string;
  /** Optional — the form collects it but does not require it. */
  phone?: string;
}

export interface WaitlistReceipt {
  id: string;
}

/** `POST /waitlist` — join the launch waitlist. */
export function joinWaitlist(input: WaitlistSignup): Promise<WaitlistReceipt> {
  return apiPost<WaitlistReceipt>("/waitlist", input);
}
