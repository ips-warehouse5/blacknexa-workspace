import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ImagePlaceholder } from "@/components/ui/image-placeholder";
import { getNewsArticleBySlug } from "@/data/news";
import { siteConfig } from "@/data/site";

// News content is fetched fresh per request, never statically cached — see
// getNewsArticleBySlug's cache: "no-store".
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getNewsArticleBySlug(slug);
  // Calling notFound() here (rather than only in the page body) is what
  // Next.js resolves before the response commits, so the response is a real
  // HTTP 404 rather than a 200 that happens to render 404-looking content —
  // required for correct SEO/crawler behavior.
  if (!article) notFound();

  const url = `${siteConfig.url}/news/${article.slug}`;
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/news/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.excerpt,
      url,
      publishedTime: article.publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getNewsArticleBySlug(slug);
  if (!article) notFound();

  const url = `${siteConfig.url}/news/${article.slug}`;
  const paragraphs = article.content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedAt,
    author: article.author ? { "@type": "Person", name: article.author } : undefined,
    publisher: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    mainEntityOfPage: url,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "News", item: `${siteConfig.url}/news` },
      { "@type": "ListItem", position: 3, name: article.title, item: url },
    ],
  };

  return (
    <article className="px-7 pb-[clamp(80px,9vw,120px)] pt-[clamp(122px,13vw,172px)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Container className="max-w-[820px] px-0">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap gap-2 text-[13px] text-text-muted">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/news" className="hover:text-accent">
            News
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-secondary">{article.title}</span>
        </nav>

        <p className="mb-[18px] text-[11px] font-semibold tracking-[0.22em] text-accent">
          {article.category.toUpperCase()}
        </p>
        <h1 className="font-serif text-[clamp(2rem,4.6vw,3.4rem)] font-bold leading-[1.06] tracking-[-0.02em] text-text-primary">
          {article.title}
        </h1>
        <p className="mt-5 text-[13.5px] tracking-[0.02em] text-text-muted">
          {article.readTime} · {article.publishedAt}
          {article.author ? ` · ${article.author}` : ""} · {article.sourcesCount} sources
        </p>

        <div className="mt-8">
          <ImagePlaceholder label={`${article.category} story image · 16:10`} aspect="16 / 9" />
        </div>

        <div className="mt-10 flex flex-col gap-[18px]">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-pretty text-base leading-[1.78] text-text-secondary">
              {p}
            </p>
          ))}
        </div>

        {article.sources.length > 0 ? (
          <div className="mt-[clamp(40px,5vw,56px)] rounded-[5px] border border-border bg-surface p-[26px]">
            <h2 className="font-serif text-[1.2rem] font-semibold text-text-primary">
              Verified sources
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {article.sources.map((s) => (
                <li key={s.url} className="text-[14.5px] leading-[1.5]">
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link
          href="/news"
          className="mt-[clamp(40px,5vw,56px)] inline-flex min-h-[48px] items-center rounded-[3px] border border-border px-[22px] text-[14px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          ← Back to all news
        </Link>
      </Container>
    </article>
  );
}
