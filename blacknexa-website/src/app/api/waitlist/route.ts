import { NextResponse } from "next/server";

import { WAITLIST_ENDPOINT_READY, joinWaitlist } from "@/lib/api/waitlist";
import { badRequest, respondToApiError, unavailable } from "@/lib/api/respond";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

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

  if (!email || !EMAIL_RE.test(email)) {
    return badRequest("A valid email address is required.");
  }

  if (!WAITLIST_ENDPOINT_READY) {
    return unavailable("Waitlist signups are not open yet.");
  }

  try {
    await joinWaitlist({ email, ...(phone ? { phone } : {}) });
  } catch (error) {
    return respondToApiError(error, "The waitlist is not configured yet.");
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
