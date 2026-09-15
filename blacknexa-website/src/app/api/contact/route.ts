import { NextResponse } from "next/server";

import {
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_SUBJECT_DEFAULT,
  isContactSubject,
} from "@/data/contact";
import { submitContactInquiry } from "@/lib/api/contact";
import { badRequest, respondToApiError } from "@/lib/api/respond";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * `POST /api/contact` — the contact form's endpoint.
 *
 * A proxy, not a store: it shapes and checks the submission, then hands it to
 * the platform API. Going through this app rather than calling the API from
 * the browser keeps the API's address off the client and out of CORS.
 *
 * The checks below mirror the form's own. They exist because the form's can be
 * skipped — and the API checks everything again regardless, which is the check
 * that counts.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  // An unrecognised subject falls back rather than being forwarded: the API
  // would reject it, and the default is what the form starts on anyway.
  const subject = isContactSubject(body?.subject) ? body.subject : CONTACT_SUBJECT_DEFAULT;

  if (!name || !email || !EMAIL_RE.test(email) || message.length < CONTACT_MESSAGE_MIN) {
    return badRequest("Please fill in all fields correctly.");
  }

  if (message.length > CONTACT_MESSAGE_MAX) {
    return badRequest(
      `Please keep the message under ${CONTACT_MESSAGE_MAX.toLocaleString()} characters.`,
    );
  }

  try {
    await submitContactInquiry({ name, email, subject, message });
  } catch (error) {
    return respondToApiError(error, "The contact form is not configured yet.");
  }

  // The receipt is not passed on: the form shows a thank-you, and an id the
  // visitor cannot use anywhere is not something to hand out.
  return NextResponse.json({ ok: true }, { status: 200 });
}
