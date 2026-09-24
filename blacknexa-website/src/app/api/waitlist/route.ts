import { NextResponse } from "next/server";

import {
  REFERRAL_CODE_RE,
  WAITLIST_ENDPOINT_READY,
  joinWaitlist,
  type WaitlistReceipt,
} from "@/lib/api/waitlist";
import { badRequest, respondToApiError, unavailable } from "@/lib/api/respond";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * `WAITLIST_PREVIEW=1` answers with a made-up receipt so the funnel's success
 * state can be reviewed before the backend exists. Never set it in production:
 * the position and code it returns are not real.
 */
const PREVIEW = process.env.WAITLIST_PREVIEW === "1";

function previewReceipt(): WaitlistReceipt {
  return {
    id: "preview",
    position: 3200 + Math.floor(Math.random() * 1300),
    referralCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
  };
}

/**
 * `POST /api/waitlist` — the waitlist form's endpoint.
 *
 * Structured like the contact route, but the API endpoint it calls does not
 * exist yet, so the flag short-circuits it. Failing here and saying so beats
 * posting into a 404 and reporting a server fault for a feature that was
 * simply never built.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const ref = typeof body?.referredBy === "string" ? body.referredBy.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return badRequest("A valid email address is required.");
  }

  // A malformed code is dropped rather than rejected — a mangled share link
  // should not stop someone joining.
  const referredBy = REFERRAL_CODE_RE.test(ref) ? ref : undefined;

  if (!WAITLIST_ENDPOINT_READY && !PREVIEW) {
    return unavailable("Waitlist signups are not open yet.");
  }

  let receipt: WaitlistReceipt;
  if (!WAITLIST_ENDPOINT_READY) {
    receipt = previewReceipt();
  } else {
    try {
      receipt = await joinWaitlist({
        email,
        ...(phone ? { phone } : {}),
        ...(referredBy ? { referredBy } : {}),
      });
    } catch (error) {
      return respondToApiError(error, "The waitlist is not configured yet.");
    }
  }

  return NextResponse.json(
    { ok: true, position: receipt.position, referralCode: receipt.referralCode },
    { status: 200 },
  );
}
