"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const EXAMPLE_LINK = "blacknexa.com/join?ref=YOURNAME";

export function ReferralLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${EXAMPLE_LINK}`);
    } catch {
      // clipboard API unavailable — link is still visible to copy manually
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="mt-8 flex flex-wrap items-end gap-5 rounded-[5px] border border-border bg-background p-6">
      <div className="min-w-[min(100%,280px)] flex-1">
        <p className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-text-muted">
          YOUR REFERRAL LINK
        </p>
        <p className="break-words rounded-[3px] border border-border bg-surface px-4 py-[15px] text-[14.5px] text-text-primary">
          {EXAMPLE_LINK}
        </p>
      </div>
      <Button type="button" onClick={copy}>
        {copied ? "Link copied" : "Copy link"}
      </Button>
    </div>
  );
}
