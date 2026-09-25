/** The live domain. Only a deployment on this host is indexed by search engines. */
export const PRODUCTION_URL = "https://blacknexa.com";

/**
 * This deployment's own origin, from `NEXT_PUBLIC_SITE_URL` (inlined at build):
 *   production  → https://blacknexa.com
 *   development → https://blacknexa.project-demo.info
 * Canonicals, Open Graph URLs, the sitemap, and referral links all build on it,
 * so a dev build never points visitors or crawlers at production.
 */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || PRODUCTION_URL).replace(/\/+$/, "");

export const siteConfig = {
  name: "BlackNexa",
  tagline: "Document. Preserve. Connect.",
  /** Search-facing title for the homepage (client SEO brief, Sep 2026). */
  seoTitle: "BlackNexa™ | Social Justice Technology Platform & Civil Rights App",
  seoDescription:
    "BlackNexa™ is a global technology platform providing a secure Pocket Reporting Tool, AI fact-checked news, and incident routing solutions. Note: BlackNexa is a tech platform, not a law firm.",
  socialTitle: "BlackNexa™ | The Global Social Justice Technology Platform",
  socialDescription:
    "Empowering communities with technical tools to report discrimination, route evidence, and access verified news. Technology platform disclaimer applies.",
  /** Twitter/X card copy — the client gave it separately from Open Graph. */
  twitterTitle: "BlackNexa™ | Global Civil Rights & Accountability",
  twitterDescription:
    "Protecting constitutional and God-given rights with the Pocket Reporting Tool and AI-driven fact-checked news.",
  /** Share-card image. 1200x630 is ideal; this is the closest asset we have. */
  socialImage: "/images/blacknexa/hero-community.jpg",
  /** Target search terms from the client's keyword research. */
  keywords: [
    "social justice platform",
    "civil rights app",
    "how to report discrimination",
    "report workplace discrimination",
    "report discriminatory activities system",
    "civil rights agency complaint portal",
    "civil rights violation reporting tool",
    "police accountability app",
    "police transparency app",
    "racial profiling legal help",
    "know your rights app",
    "community safety app",
    "civil rights news network",
    "black empowerment media",
    "press routing tool",
    "incident logging dispatch",
    "pocket reporting tool",
    "BlackNexa",
  ],
  description:
    "BlackNexa is a privacy-first civic platform: seal evidence with GPS and timestamps, route reports to the agencies that should answer, and read source-verified news. Join the pre-launch waitlist.",
  url: siteUrl,
  /** False on dev/staging: robots.txt and meta robots then say noindex. */
  isProduction: siteUrl === PRODUCTION_URL,
  trademarkNote: "BlackNexa™ — trademark pending, USPTO.",
  contactLines: [
    {
      label: "PARTNERSHIPS & ADVERTISING",
      email: "advertising@blacknexa.com",
      href: "mailto:advertising@blacknexa.com",
    },
    { label: "PRESS", email: "media@blacknexa.com", href: "mailto:media@blacknexa.com" },
    { label: "LEGAL", email: "support@blacknexa.com", href: "mailto:support@blacknexa.com" },
  ],
  /** Official profiles, rendered in the footer and on /contact, and listed as `sameAs` in the Organization JSON-LD. */
  socialLinks: [
    {
      platform: "instagram",
      label: "Instagram",
      handle: "@blacknexa_",
      href: "https://www.instagram.com/blacknexa_/",
    },
    {
      platform: "tiktok",
      label: "TikTok",
      handle: "@blacknexa",
      href: "https://www.tiktok.com/@blacknexa",
    },
  ] as const,
};
