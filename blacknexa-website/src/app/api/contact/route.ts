import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Matches the platform API's cap, so an over-long message fails here first. */
const MESSAGE_MAX = 5000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "general";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!name || !email || !EMAIL_RE.test(email) || message.length < 12) {
    return NextResponse.json({ error: "Please fill in all fields correctly." }, { status: 400 });
  }

  if (message.length > MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Please keep the message under ${MESSAGE_MAX.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  const contactApiUrl = process.env.CONTACT_API_URL;
  if (!contactApiUrl) {
    return NextResponse.json(
      { error: "Contact service is not configured yet." },
      { status: 503 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(contactApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, subject, message }),
    });
  } catch {
    // The API is unreachable — a different problem from one it reported, and
    // the only one where "try again" is genuinely the right advice.
    return NextResponse.json(
      { error: "Something went wrong on our end — try again." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    /*
     * A 4xx is something about the submission the API rejected — most likely a
     * rate limit, since the fields are checked above. Passing its message
     * through means the visitor is told what to do instead of being blamed for
     * a fault on our side. 5xx stays generic: whatever it says is about our
     * internals, not theirs.
     */
    const detail = await upstream.json().catch(() => null);
    const upstreamMessage =
      typeof detail?.error === "string"
        ? detail.error
        : typeof detail?.message === "string"
          ? detail.message
          : null;

    const clientFault = upstream.status >= 400 && upstream.status < 500;
    return NextResponse.json(
      {
        error:
          clientFault && upstreamMessage
            ? upstreamMessage
            : "Something went wrong on our end — try again.",
      },
      { status: clientFault ? upstream.status : 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
