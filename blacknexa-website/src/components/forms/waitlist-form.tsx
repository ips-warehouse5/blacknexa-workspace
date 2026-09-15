"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "sending" | "success" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

async function submitWaitlist(payload: { email: string; phone: string }): Promise<void> {
  const res = await fetch("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Something went wrong on our end — try again.");
  }
}

export function WaitlistForm({
  variant = "hero",
  idPrefix,
}: {
  variant?: "hero" | "cta";
  idPrefix: string;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const isHero = variant === "hero";
  // The hero variant sits on the Hero section, which switches
  // between a dark photographic treatment and a light one with the
  // theme (see --bn-feature-* tokens); the cta variant always sits on
  // a plain page surface, so it uses the regular tokens directly.
  const inputStyle: React.CSSProperties = isHero
    ? {
        background: "rgb(var(--bn-feature-scrim) / 0.62)",
        borderColor: error ? "var(--bn-err)" : "var(--bn-feature-input-border)",
        color: "var(--bn-feature-ink)",
      }
    : {
        background: "var(--bn-surface)",
        borderColor: error ? "var(--bn-err)" : "var(--bn-border)",
        color: "var(--bn-text-primary)",
      };

  function validate(value: string) {
    if (!value.trim()) return "Enter an email address so we can reach you.";
    if (!EMAIL_RE.test(value.trim())) return "That email address doesn't look right.";
    return "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validation = validate(email);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setStatus("sending");
    try {
      await submitWaitlist({ email, phone });
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-[5px] border p-7 text-center md:text-left"
        style={{
          borderColor: "var(--bn-accent)",
          background: "var(--bn-accent-soft)",
        }}
      >
        <h3
          className="font-serif text-[26px] font-semibold"
          style={{ color: isHero ? "var(--bn-feature-ink)" : "var(--bn-text-primary)" }}
        >
          You&rsquo;re on the list.
        </h3>
        <p
          className="mt-3 text-[15px] leading-[1.6]"
          style={{ color: isHero ? "var(--bn-feature-ink2)" : "var(--bn-text-secondary)" }}
        >
          We&rsquo;ll email you the moment BlackNexa hits the App Store and Google Play.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap gap-2.5">
        <div className="min-w-[min(100%,260px)] flex-1">
          <label htmlFor={`${idPrefix}-email`} className="sr-only">
            Email address
          </label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            name="email"
            autoComplete="email"
            aria-invalid={!!error}
            aria-describedby={`${idPrefix}-msg`}
            placeholder="Enter your email for pre-launch app store alerts…"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            onBlur={() => {
              if (email.trim()) setError(validate(email));
            }}
            className="w-full rounded-[3px] border px-[17px] py-4 text-[15px] focus:border-accent"
            style={inputStyle}
          />
        </div>
        <Button type="submit" disabled={status === "sending"}>
          {status === "sending" ? (
            <span
              aria-hidden="true"
              className="block h-[15px] w-[15px] animate-[bn-spin_0.7s_linear_infinite] rounded-full border-2 border-current/30 border-t-current"
            />
          ) : null}
          {status === "sending" ? "Securing…" : isHero ? "Secure Your Spot" : "Join the Global Movement"}
        </Button>
      </div>

      {/*
        This error is tied to the email input above (aria-describedby
        points here regardless of position), but it must also sit
        directly below that input visually — placing it after the
        optional phone block would detach it from the field it
        describes the moment a visitor reveals the phone field.
      */}
      <p
        id={`${idPrefix}-msg`}
        role="alert"
        className="mt-3.5 min-h-[1px] text-[13.5px] leading-[1.5]"
        style={{ color: error ? "var(--bn-err)" : isHero ? "var(--bn-feature-ink2)" : "var(--bn-text-secondary)" }}
      >
        {error}
      </p>

      {showPhone ? (
        <div className="mt-2.5">
          <label
            htmlFor={`${idPrefix}-phone`}
            className="mb-[7px] block text-xs tracking-[0.1em]"
            style={{ color: isHero ? "var(--bn-feature-ink2)" : "var(--bn-text-secondary)" }}
          >
            PHONE (OPTIONAL)
          </label>
          <input
            id={`${idPrefix}-phone`}
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="(555) 010-0199"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full max-w-[320px] rounded-[3px] border px-4 py-[14px] text-[15px] focus:border-accent"
            style={inputStyle}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPhone(true)}
          className="mt-3 border-0 border-b bg-transparent p-0 text-[13.5px] hover:text-accent"
          style={{
            color: isHero ? "var(--bn-feature-ink2)" : "var(--bn-text-secondary)",
            borderColor: isHero ? "var(--bn-feature-input-border)" : "var(--bn-border)",
          }}
        >
          + Add a phone number for text alerts
        </button>
      )}

      <p
        className="mt-2 text-[13.5px] leading-[1.6]"
        style={{ color: isHero ? "var(--bn-feature-ink2)" : "var(--bn-text-secondary)" }}
      >
        Instant push and email alert the moment we drop on the Apple App Store and Google Play. Zero spam.
      </p>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-text-muted">
        By joining you agree to our{" "}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        . We never sell your data.
      </p>
    </form>
  );
}
