"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A member's copyable referral link, shown after they join the waitlist. */
export function ReferralLink({
  link,
  className = "mt-8",
}: {
  /** Full URL to display and copy. */
  link: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const display = link.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // clipboard API unavailable — link is still visible to copy manually
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div
      className={`${className} flex flex-wrap items-end gap-5 rounded-[5px] border border-border bg-surface p-6`}
    >
      <div className="min-w-[min(100%,280px)] flex-1 text-left">
        <p className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-text-muted">
          YOUR REFERRAL LINK
        </p>
        <p className="break-words rounded-[3px] border border-border bg-background px-4 py-[15px] text-[14.5px] text-text-primary">
          {display}
        </p>
      </div>
      <Button type="button" onClick={copy}>
        {copied ? "Link copied" : "Copy link"}
      </Button>
    </div>
  );
}
