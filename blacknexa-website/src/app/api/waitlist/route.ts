import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const waitlistApiUrl = process.env.WAITLIST_API_URL;
  if (!waitlistApiUrl) {
    return NextResponse.json(
      { error: "Waitlist service is not configured yet." },
      { status: 503 }
    );
  }

  const upstream = await fetch(waitlistApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, phone: phone || undefined }),
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Something went wrong on our end — try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
