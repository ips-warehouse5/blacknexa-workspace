import Link from "next/link";
import { BlackNexaLogo } from "@/components/ui/logo";

export function DisclaimerSummarySection() {
  return (
    <section
      id="disclaimers"
      className="border-t border-border px-7 py-[clamp(72px,8vw,110px)]"
    >
      <div className="bn-reveal mx-auto flex max-w-[1080px] flex-wrap gap-[clamp(28px,4vw,64px)]">
        <div className="min-w-[min(100%,220px)] flex-[0_1_260px]">
          <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent">
            LEGAL DISCLAIMER
          </p>
          <BlackNexaLogo withWordmark={false} size={34} />
        </div>
        <div className="min-w-[min(100%,300px)] max-w-[74ch] flex-[1_1_480px]">
          <p className="text-pretty text-[15.5px] leading-[1.76] text-text-secondary">
            <strong className="font-semibold text-text-primary">Service Disclaimer:</strong>{" "}
            BlackNexa™ provides automated evidence vaulting, location resolution, and dynamic
            agency matching tools.
          </p>
          <p className="mt-[18px] text-pretty text-[15.5px] leading-[1.76] text-text-secondary">
            BlackNexa™ is not a government agency, law firm, or legal referral service. Generating
            intake filings or transmitting verified incident packages to researched agencies does
            not guarantee that any agency will initiate an investigation, take enforcement action,
            or grant relief.
          </p>
          <div className="mt-[26px] flex flex-wrap gap-3">
            <Link
              href="/disclaimer"
              className="inline-flex min-h-[48px] items-center gap-2.5 rounded-[3px] bg-accent px-[22px] text-[14.5px] font-semibold text-accent-foreground transition-[filter] hover:brightness-110"
            >
              Read all disclaimers
            </Link>
            <Link
              href="/terms"
              className="inline-flex min-h-[48px] items-center rounded-[3px] border border-border px-[22px] text-[14.5px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
