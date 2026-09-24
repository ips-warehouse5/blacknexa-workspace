import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { privacySections, privacyUpdated } from "@/data/legal";
import { siteConfig } from "@/data/site";

const description = "How BlackNexa collects, protects, and handles your account and evidence data.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    title: `Privacy Policy — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/privacy`,
  },
  twitter: { card: "summary", title: `Privacy Policy — ${siteConfig.name}`, description },
};

// Server-rendered on every request per the client's SSR requirement.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" updated={privacyUpdated} sections={privacySections} />;
}
