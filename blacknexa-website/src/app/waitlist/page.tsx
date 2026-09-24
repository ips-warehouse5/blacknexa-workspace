import type { Metadata } from "next";
// TODO: re-enable the Referral Program section when the client wants it back.
// import { ReferralSection } from "@/components/sections/referral-section";
import { DisclaimerSummarySection } from "@/components/sections/disclaimer-summary-section";
import { ComingSoonBadges } from "@/components/ui/coming-soon-badges";
import { WaitlistForm } from "@/components/forms/waitlist-form";
import { REFERRAL_CODE_RE } from "@/lib/api/waitlist";
import { siteConfig } from "@/data/site";

const title = "Secure Pre-Launch Waitlist & Download Portal";
const description =
  "Secure your spot on the BlackNexa™ priority waitlist. Get early access to the global social justice platform and secure Pocket Reporting Tool.";

export const metadata: Metadata = {
  // Absolute: the client specified this exact title, brand first.
  title: { absolute: `BlackNexa™ | ${title}` },
  description,
  keywords: [
    "social justice platform",
    "civil rights app",
    "report discriminatory activities system",
    "civil rights agency complaint portal",
    "press routing tool",
    "pocket reporting tool",
    "BlackNexa",
  ],
  alternates: { canonical: "/waitlist" },
  // Replaces (not merges with) the layout's `other`, so geo is restated.
  other: { title: `BlackNexa™ | ${title}`, "geo.placename": "Global" },
  openGraph: {
    type: "website",
    title: `BlackNexa™ | ${title}`,
    description,
    url: `${siteConfig.url}/waitlist`,
    // Restated: a page-level openGraph replaces the layout's, image included.
    images: [{ url: siteConfig.socialImage, alt: `${siteConfig.name} community` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `BlackNexa™ | ${title}`,
    description,
    images: [siteConfig.socialImage],
  },
};

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { ref } = await searchParams;
  const code =
    typeof ref === "string" && REFERRAL_CODE_RE.test(ref) ? ref : undefined;

  return (
    <>
      <div
        className="relative overflow-hidden px-7 pb-[clamp(72px,8vw,112px)] pt-[clamp(122px,13vw,168px)]"
        style={{ background: "var(--bn-feature-bg)" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(72% 90% at 50% 0%, var(--bn-accent-soft) 0%, rgba(0,0,0,0) 68%)",
          }}
        />
        <div className="relative mx-auto max-w-[760px] text-center">
          <p className="mb-6 text-[11px] font-semibold tracking-[0.22em] text-accent-text">
            DON&rsquo;T GET CAUGHT UNPROTECTED
          </p>
          <h1
            className="text-balance font-serif text-[clamp(2.3rem,5.6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em]"
            style={{ color: "var(--bn-feature-ink)" }}
          >
            Secure Your Priority Access to the{" "}
            <span className="text-accent-text">Pocket Reporting Tool</span>
          </h1>
          <p
            className="mx-auto mt-7 max-w-[60ch] text-pretty text-[clamp(1rem,1.3vw,1.16rem)] leading-[1.72]"
            style={{ color: "var(--bn-feature-ink2)" }}
          >
            Join the pre-launch waitlist to lock down early download access and
            protect your community with uncompromised digital tooling.
          </p>

          {code ? (
            <p className="mx-auto mt-6 inline-block rounded-[3px] border border-accent px-4 py-2 text-[13.5px] text-accent-text">
              You were invited by a BlackNexa member. Join to credit them.
            </p>
          ) : null}

          <div className="mx-auto mt-10 max-w-[620px] rounded-[5px] border border-border bg-background p-[clamp(20px,3vw,32px)] text-left">
            <WaitlistForm
              variant="cta"
              idPrefix="funnel"
              referredBy={code}
              allowPhone={false}
              copy={{
                placeholder: "Enter your email address…",
                submit: "Join Priority Waitlist",
                successTitle: "You’re Secured on the List!",
                sharePrompt:
                  "Want to jump ahead? Share your unique referral link with your community or network:",
              }}
            />
          </div>

          <p
            className="mt-9 text-[11px] font-semibold tracking-[0.18em]"
            style={{ color: "var(--bn-feature-ink2)" }}
          >
            DOWNLOAD ON
          </p>
          <ComingSoonBadges className="mt-4 justify-center" />
        </div>

      </div>
      {/* TODO: Referral Program section — not in the client's funnel brief,
          hidden for now. Uncomment (and the import above) to bring it back. */}
      {/* <ReferralSection /> */}
      <DisclaimerSummarySection eyebrow="DISCLOSURE" showLinks={false}>
        <p className="text-pretty text-[15.5px] leading-[1.76] text-text-secondary">
          BlackNexa™ is a technology platform and software provider — not a law
          firm, legal counseling service, or government regulatory agency.
        </p>
        <p className="mt-[18px] text-pretty text-[15.5px] leading-[1.76] text-text-secondary">
          Use of this platform establishes a technology utility service
          agreement, not an attorney-client relationship.
        </p>
      </DisclaimerSummarySection>
    </>
  );
}
