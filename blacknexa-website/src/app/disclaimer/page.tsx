import type { Metadata } from "next";
import Link from "next/link";
import { disclaimers } from "@/data/legal";
import { siteConfig } from "@/data/site";

const description =
  "BlackNexa is a technology and software platform provider, not a government agency, law firm, or legal referral service.";

export const metadata: Metadata = {
  title: "Disclaimers",
  description,
  alternates: { canonical: "/disclaimer" },
  openGraph: {
    type: "website",
    title: `Disclaimers — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/disclaimer`,
  },
  twitter: { card: "summary", title: `Disclaimers — ${siteConfig.name}`, description },
};

// Server-rendered on every request per the client's SSR requirement.
export const dynamic = "force-dynamic";

export default function DisclaimerPage() {
  return (
    <div className="px-7 pb-[clamp(80px,9vw,120px)] pt-[clamp(122px,13vw,172px)]">
      <div className="mx-auto max-w-[760px]">
        <p className="mb-5 text-[11px] font-semibold tracking-[0.22em] text-accent-text">LEGAL</p>
        <h1 className="font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-bold leading-[1.06] tracking-[-0.02em] text-text-primary">
          Disclaimers
        </h1>

        <div className="mt-[clamp(40px,5vw,60px)] flex flex-col gap-7">
          {disclaimers.map((d) => (
            <div key={d.body.slice(0, 24)}>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-text-muted">
                {d.label}
              </p>
              <p className="mt-3 text-pretty text-[15px] leading-[1.76] text-text-secondary">
                {d.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-[clamp(40px,5vw,56px)] flex flex-wrap gap-3">
          <Link
            href="/terms"
            className="inline-flex min-h-[48px] items-center rounded-[3px] bg-accent px-[22px] text-[14px] font-semibold text-accent-foreground transition-[filter] hover:brightness-110"
          >
            Read the full Terms of Service
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-[48px] items-center rounded-[3px] border border-border px-[22px] text-[14px] text-text-secondary transition-colors hover:border-accent hover:text-accent-text"
          >
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}
