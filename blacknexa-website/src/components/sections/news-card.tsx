import Link from "next/link";
import Image from "next/image";
import type { NewsArticle } from "@/data/news";
import { versionedAsset } from "@/lib/asset-version";

// Generic editorial fallback for articles the backend hasn't supplied an
// image for yet — a real, content-relevant "news reporting" photo rather
// than an empty placeholder box. Per-article `article.image` (when the
// backend provides one) always takes priority over this.
const FALLBACK_NEWS_IMAGE = "/images/blacknexa/feature-news-engine.jpg";

/** Extracted from the homepage News section so `/news` renders identical cards. */
export function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <article className="bn-reveal overflow-hidden rounded-[5px] border border-border bg-background transition-transform duration-300 hover:-translate-y-1 hover:border-accent">
      <div className="relative overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
        {article.image ? (
          // Backend-supplied image can be on any host, so this can't use a
          // static `remotePatterns` allowlist — `unoptimized` keeps it a
          // real <img> under the hood without failing the Next.js Image
          // domain check.
          <Image
            src={article.image}
            alt={article.title}
            fill
            unoptimized
            sizes="(min-width: 768px) 380px, 100vw"
            className="object-cover"
          />
        ) : (
          <Image
            src={versionedAsset(FALLBACK_NEWS_IMAGE)}
            alt={`${article.category} story`}
            fill
            sizes="(min-width: 768px) 380px, 100vw"
            className="object-cover"
          />
        )}
      </div>
      <div className="p-[22px] pb-[26px]">
        <div className="flex items-center gap-2">
          <span className="rounded-[2px] border border-accent px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-accent-text">
            {article.category.toUpperCase()}
          </span>
          <span className="rounded-[2px] border border-border px-2 py-1 text-[10px] tracking-[0.1em] text-text-muted">
            {article.sourcesCount} SOURCES
          </span>
        </div>
        <h4 className="mt-4 font-serif text-[1.2rem] font-semibold leading-[1.26] text-text-primary">
          <Link href={`/news/${article.slug}`}>{article.title}</Link>
        </h4>
        <p className="mt-3.5 text-xs tracking-[0.04em] text-text-muted">
          {article.readTime} · {article.publishedAt}
        </p>
      </div>
    </article>
  );
}
