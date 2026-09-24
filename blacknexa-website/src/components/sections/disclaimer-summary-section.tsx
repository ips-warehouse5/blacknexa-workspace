import Link from "next/link";
import type { ReactNode } from "react";
import { BlackNexaLogo } from "@/components/ui/logo";

/**
 * Legal band shown at the foot of a page. The homepage uses the default
 * service disclaimer; `/waitlist` passes the client's DISCLOSURE wording.
 */
export function DisclaimerSummarySection({
  eyebrow = "LEGAL DISCLAIMER",
  showLinks = true,
  children,
}: {
  eyebrow?: string;
  /** "Read all disclaimers" / "Terms of Service" buttons. */
  showLinks?: boolean;
  /** Body paragraphs. Omit for the default service disclaimer. */
  children?: ReactNode;
} = {}) {
  return (
    <section
      id="disclaimers"
      className="border-t border-border bg-surface px-7 py-[clamp(48px,5.2vw,74px)]"
    >
      <div className="bn-reveal mx-auto flex max-w-[1080px] flex-wrap gap-[clamp(26px,3vw,44px)]">
        <div className="min-w-[min(100%,220px)] flex-[0_1_260px]">
          <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent-text">
            {eyebrow}
          </p>
          <BlackNexaLogo withWordmark={false} size={34} />
        </div>
        <div className="min-w-[min(100%,300px)] max-w-[74ch] flex-[1_1_480px]">
          {children ?? (
            <>
              <p className="text-pretty text-[15.5px] leading-[1.76] text-text-secondary">
                <strong className="font-semibold text-text-primary">
                  Service Disclaimer:
                </strong>{" "}
                BlackNexa™ provides automated evidence vaulting, location
                resolution, and dynamic agency matching tools.
              </p>
              <p className="mt-[18px] text-pretty text-[15.5px] leading-[1.76] text-text-secondary">
                BlackNexa™ is not a government agency, law firm, or legal
                referral service. Generating intake filings or transmitting
                verified incident packages to researched agencies does not
                guarantee that any agency will initiate an investigation, take
                enforcement action, or grant relief.
              </p>
            </>
          )}
          {showLinks ? (
            <div className="mt-[26px] flex flex-wrap gap-3">
              <Link
                href="/disclaimer"
                className="inline-flex min-h-[48px] items-center gap-2.5 rounded-[3px] bg-accent px-[22px] text-[14.5px] font-semibold text-accent-foreground transition-[filter] hover:brightness-110"
              >
                Read all disclaimers
              </Link>
              <Link
                href="/terms"
                className="inline-flex min-h-[48px] items-center rounded-[3px] border border-border px-[22px] text-[14.5px] text-text-secondary transition-colors hover:border-accent hover:text-accent-text"
              >
                Terms of Service
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
