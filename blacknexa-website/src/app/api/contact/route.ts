import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "general";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!name || !email || !EMAIL_RE.test(email) || message.length < 12) {
    return NextResponse.json({ error: "Please fill in all fields correctly." }, { status: 400 });
  }

  const contactApiUrl = process.env.CONTACT_API_URL;
  if (!contactApiUrl) {
    return NextResponse.json(
      { error: "Contact service is not configured yet." },
      { status: 503 }
    );
  }

  const upstream = await fetch(contactApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, subject, message }),
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Something went wrong on our end — try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
