/**
 * Waitlist endpoints.
 *
 * **The backend endpoint does not exist yet.** The call is written out so the
 * shape is settled and the route handler reads like every other one, but
 * `WAITLIST_ENDPOINT_READY` gates it: while that is false the route says the
 * signup is not open rather than posting into a 404 and telling the visitor
 * something went wrong on our end.
 *
 * To turn it on: ship `POST /waitlist` on the API (returning the receipt
 * below), flip the flag, delete this paragraph.
 */

import { apiPost } from "@/lib/api/client";

/** Flip once `POST /waitlist` exists on the API. */
export const WAITLIST_ENDPOINT_READY = false;

/** A referral code as it appears in `?ref=` — also what the API must issue. */
export const REFERRAL_CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

export interface WaitlistSignup {
  email: string;
  /** Optional — the form collects it but does not require it. */
  phone?: string;
  /** Referral code of the member whose link brought this visitor, from `?ref=`. */
  referredBy?: string;
}

/**
 * What the API answers with. Position and code drive the funnel's success
 * state: the member sees where they stand and gets a link that moves them up
 * when the people they invite join.
 */
export interface WaitlistReceipt {
  id: string;
  /** 1-based place in the priority queue, after referral credit. */
  position: number;
  /** This member's own code, shared as `/waitlist?ref=<code>`. */
  referralCode: string;
}

/** `POST /waitlist` — join the launch waitlist. */
export function joinWaitlist(input: WaitlistSignup): Promise<WaitlistReceipt> {
  return apiPost<WaitlistReceipt>("/waitlist", input);
}
