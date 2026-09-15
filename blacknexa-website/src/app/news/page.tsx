import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { NewsCard } from "@/components/sections/news-card";
import { getNewsArticles } from "@/data/news";
import { siteConfig } from "@/data/site";

// Always reflects the current published set — see AGENTS.md / the SSR
// requirement: news content must be server-rendered fresh on every request,
// not cached as a static build artifact.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News",
  description:
    "Source-verified news from the BlackNexa AI News Engine — real stories on the subjects our communities actually need in order to thrive.",
  alternates: { canonical: "/news" },
  openGraph: {
    type: "website",
    title: `News — ${siteConfig.name}`,
    description:
      "Source-verified news from the BlackNexa AI News Engine — real stories on the subjects our communities actually need in order to thrive.",
    url: `${siteConfig.url}/news`,
  },
};

export default async function NewsPage() {
  const articles = await getNewsArticles(24);

  return (
    <div className="px-7 pb-[clamp(80px,9vw,120px)] pt-[clamp(122px,13vw,172px)]">
      <Container className="max-w-[1280px] px-0">
        <SectionHeading
          eyebrow="THE NEWS ENGINE"
          title="Real news. Zero mainstream noise."
          description="Mainstream media decides what matters. BlackNexa runs a strict, source-verified news engine on the subjects our communities actually need in order to thrive."
          maxWidth="660px"
        />

        {articles.length > 0 ? (
          <div className="mt-[clamp(40px,5vw,64px)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[26px]">
            {articles.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>
        ) : (
          <div className="mt-[clamp(40px,5vw,64px)] rounded-[5px] px-[30px] py-[clamp(44px,6vw,72px)] text-center">
            <span className="inline-flex rounded-[2px] border border-accent px-[9px] py-1 text-[11px] font-semibold tracking-[0.16em] text-accent">
              COMING SOON
            </span>
          </div>
        )}
      </Container>
    </div>
  );
}
