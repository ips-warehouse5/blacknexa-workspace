import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { legalUpdated, termsSections } from "@/data/legal";
import { siteConfig } from "@/data/site";

const description = "The terms governing use of the BlackNexa platform, app and website.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description,
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "website",
    title: `Terms of Service — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/terms`,
  },
  twitter: { card: "summary", title: `Terms of Service — ${siteConfig.name}`, description },
};

// Server-rendered on every request per the client's SSR requirement.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalDocument title="Terms of Service" updated={legalUpdated} sections={termsSections} />;
}
