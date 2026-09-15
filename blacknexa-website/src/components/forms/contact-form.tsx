"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_SUBJECT_DEFAULT,
  CONTACT_SUBJECT_OPTIONS,
} from "@/data/contact";

type Errors = Partial<Record<"name" | "email" | "message" | "submit", string>>;
type Status = "idle" | "sending" | "success";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

async function submitContact(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const res = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Something went wrong on our end — try again.");
  }
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<string>(CONTACT_SUBJECT_DEFAULT);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>("idle");

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "Tell us your name.";
    if (!email.trim()) next.email = "We need an email to reply to.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "That email address doesn't look right.";
    if (message.trim().length < CONTACT_MESSAGE_MIN) next.message = "A little more detail helps us route this.";
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validate();
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      await submitContact({ name, email, subject, message });
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      setErrors({ submit: err instanceof Error ? err.message : "Something went wrong — try again." });
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-[5px] border p-[34px]"
        style={{ borderColor: "var(--bn-accent)", background: "var(--bn-accent-soft)" }}
      >
        <h2 className="font-serif text-[28px] font-semibold text-text-primary">Message sent.</h2>
        <p className="mt-3 text-[15px] leading-[1.65] text-text-secondary">
          We answer most enquiries within two business days. Partnership and press requests are
          prioritised.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-[22px]"
          onClick={() => {
            setStatus("idle");
            setName("");
            setEmail("");
            setSubject(CONTACT_SUBJECT_DEFAULT);
            setMessage("");
          }}
        >
          Send another
        </Button>
      </div>
    );
  }

  const fieldBorder = (key: keyof Errors) => (errors[key] ? "var(--bn-err)" : "var(--bn-border)");

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[22px]">
      <Field label="NAME" htmlFor="c-name" error={errors.name}>
        <input
          id="c-name"
          type="text"
          name="name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          placeholder="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (!name.trim()) setErrors((s) => ({ ...s, name: "Tell us your name." }));
          }}
          className="w-full rounded-[3px] border bg-surface px-4 py-[15px] text-[15px] text-text-primary focus:border-accent"
          style={{ borderColor: fieldBorder("name") }}
        />
      </Field>

      <Field label="EMAIL" htmlFor="c-email" error={errors.email}>
        <input
          id="c-email"
          type="email"
          name="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => {
            if (email.trim() && !EMAIL_RE.test(email.trim())) {
              setErrors((s) => ({ ...s, email: "That email address doesn't look right." }));
            }
          }}
          className="w-full rounded-[3px] border bg-surface px-4 py-[15px] text-[15px] text-text-primary focus:border-accent"
          style={{ borderColor: fieldBorder("email") }}
        />
      </Field>

      <Field label="SUBJECT" htmlFor="c-subject">
        <Select
          id="c-subject"
          name="subject"
          value={subject}
          options={CONTACT_SUBJECT_OPTIONS}
          onChange={setSubject}
        />
      </Field>

      <Field label="MESSAGE" htmlFor="c-message" error={errors.message}>
        <textarea
          id="c-message"
          name="message"
          rows={6}
          maxLength={CONTACT_MESSAGE_MAX}
          aria-invalid={!!errors.message}
          placeholder="Tell us what you need."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => {
            if (message.trim() && message.trim().length < CONTACT_MESSAGE_MIN) {
              setErrors((s) => ({ ...s, message: "A little more detail helps us route this." }));
            }
          }}
          className="w-full resize-y rounded-[3px] border bg-surface px-4 py-[15px] text-[15px] leading-[1.6] text-text-primary focus:border-accent"
          style={{ borderColor: fieldBorder("message") }}
        />
      </Field>

      <div>
        <Button type="submit" disabled={status === "sending"}>
          {status === "sending" ? (
            <span
              aria-hidden="true"
              className="block h-[15px] w-[15px] animate-[bn-spin_0.7s_linear_infinite] rounded-full border-2 border-current/30 border-t-current"
            />
          ) : null}
          {status === "sending" ? "Sending…" : "Send message"}
        </Button>
        {errors.submit ? (
          <p role="alert" className="mt-[11px] text-[13px]" style={{ color: "var(--bn-err)" }}>
            {errors.submit}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-[9px] block text-[11.5px] font-semibold tracking-[0.14em] text-text-secondary"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-[7px] text-[13px]" style={{ color: "var(--bn-err)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
