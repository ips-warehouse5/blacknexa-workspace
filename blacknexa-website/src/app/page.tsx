import type { Metadata } from "next";
import { Suspense } from "react";
import { Hero } from "@/components/sections/hero";
import { ProofBar } from "@/components/sections/proof-bar";
import { FaithSection } from "@/components/sections/faith-section";
import { AboutSection } from "@/components/sections/about-section";
import { NexaSection } from "@/components/sections/nexa-section";
import { MissionSection } from "@/components/sections/mission-section";
import { ServicesSection } from "@/components/sections/services-section";
import { BenefitsSection } from "@/components/sections/benefits-section";
import { GlobalMissionSection } from "@/components/sections/global-mission-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { FeatureBlocksSection } from "@/components/sections/feature-blocks-section";
import { NewsSection } from "@/components/sections/news-section";
import { WhyChooseSection } from "@/components/sections/why-choose-section";
import { SecuritySection } from "@/components/sections/security-section";
import { ImpactSection } from "@/components/sections/impact-section";
import { PromoSection } from "@/components/sections/promo-section";
// TODO: "Secure your spot before launch" section hidden — sign-ups now go
// through /waitlist (client funnel brief). Uncomment here and below to restore.
// import { WaitlistSection } from "@/components/sections/waitlist-section";
import { FinalCtaSection } from "@/components/sections/final-cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { ContactTeaserSection } from "@/components/sections/contact-teaser-section";
import { DisclaimerSummarySection } from "@/components/sections/disclaimer-summary-section";
import { SectionPlaceholder } from "@/components/sections/section-placeholder";

// Server-rendered on every request (not a static build artifact) — the News
// section's data must always reflect the backend's current state.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProofBar />
      <FaithSection />
      <AboutSection />
      <NexaSection />
      <MissionSection />
      <ServicesSection />
      <BenefitsSection />
      <GlobalMissionSection />
      <HowItWorksSection />
      <FeatureBlocksSection />
      {/* News and FAQ read the platform API at request time. Each streams in
          behind its own boundary so a slow or unreachable API delays only
          that section, never the rest of the page. */}
      <Suspense fallback={<SectionPlaceholder id="news" className="min-h-[1270px] md:min-h-[980px]" />}>
        <NewsSection />
      </Suspense>
      <WhyChooseSection />
      <SecuritySection />
      <ImpactSection />
      <PromoSection />
      {/* TODO: hidden, see import note above. <WaitlistSection /> */}
      <FinalCtaSection />
      <Suspense fallback={<SectionPlaceholder id="faq" className="min-h-[2290px] md:min-h-[1640px]" />}>
        <FaqSection />
      </Suspense>
      <ContactTeaserSection />
      <DisclaimerSummarySection />
    </>
  );
}
