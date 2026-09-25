import type { Metadata } from "next";
import { Spectral, Work_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { FaviconSync } from "@/components/theme/favicon-sync";
import { themeInitScript } from "@/lib/theme";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { RevealInit } from "@/components/ui/reveal-init";
import { siteConfig } from "@/data/site";

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-work-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.seoTitle,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.seoDescription,
  keywords: siteConfig.keywords,
  openGraph: {
    type: "website",
    siteName: `${siteConfig.name}™`,
    title: siteConfig.socialTitle,
    description: siteConfig.socialDescription,
    url: siteConfig.url,
    images: [
      { url: siteConfig.socialImage, alt: `${siteConfig.name} community` },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.twitterTitle,
    description: siteConfig.twitterDescription,
    images: [siteConfig.socialImage],
  },
  robots: siteConfig.isProduction
    ? {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
        googleBot: {
          index: true,
          follow: true,
          "max-snippet": -1,
          "max-image-preview": "large",
          "max-video-preview": -1,
        },
      }
    : { index: false, follow: false },
  other: { title: siteConfig.seoTitle, "geo.placename": "Global" },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.seoDescription,
  sameAs: siteConfig.socialLinks.map((s) => s.href),
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteConfig.name,
  url: siteConfig.url,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${spectral.variable} ${workSans.variable}`}
    >
      <head>
        {/* Sets data-theme before first paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      {/* Browser extensions (Grammarly, password managers) write attributes
          onto <body> before React hydrates. This ignores attribute diffs on
          this element only — mismatches in its children are still reported. */}
      <body suppressHydrationWarning>
        <ThemeProvider>
          <FaviconSync />
          <RevealInit />
          <Header />
          <main>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
