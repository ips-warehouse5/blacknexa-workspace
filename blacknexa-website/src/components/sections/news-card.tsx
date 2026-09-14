import Link from "next/link";
import { ImagePlaceholder } from "@/components/ui/image-placeholder";
import type { NewsArticle } from "@/data/news";

/** Extracted from the homepage News section so `/news` renders identical cards. */
export function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <article className="bn-reveal overflow-hidden rounded-[5px] border border-border bg-surface transition-transform duration-300 hover:-translate-y-1 hover:border-accent">
      <ImagePlaceholder label={`${article.category} story image · 16:10`} aspect="16 / 10" />
      <div className="p-[22px] pb-[26px]">
        <div className="flex items-center gap-2">
          <span className="rounded-[2px] border border-accent px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-accent">
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
