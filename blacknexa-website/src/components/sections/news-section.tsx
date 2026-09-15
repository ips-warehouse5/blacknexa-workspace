import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { newsCategories } from "@/data/features";
import { getNewsArticles } from "@/data/news";
import { NewsCard } from "./news-card";

export async function NewsSection() {
  const newsArticles = await getNewsArticles();

  return (
    <section id="news" className="bg-surface-elevated px-7 py-[clamp(56px,6vw,86px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="PRODUCT HIGHLIGHTS · THE NEWS ENGINE"
          title="Real news. Zero mainstream noise."
          description="Mainstream media decides what matters. BlackNexa runs a strict, source-verified news engine on the subjects our communities actually need in order to thrive."
          maxWidth="660px"
        />

        <div className="mt-[clamp(30px,3.4vw,44px)] grid grid-cols-[repeat(auto-fit,minmax(244px,1fr))] gap-px overflow-hidden rounded border border-border bg-border">
          {newsCategories.map((c) => (
            <div key={c.title} className="bn-reveal bg-background px-6 pb-[30px] pt-[26px]">
              <span className="text-accent-text">
                <Icon name={c.icon} size={24} />
              </span>
              <h3 className="mt-5 font-serif text-[1.32rem] font-semibold leading-[1.22] text-text-primary">
                {c.title}
              </h3>
              <p className="mt-[11px] text-[14.5px] leading-[1.62] text-text-secondary">{c.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-[clamp(36px,4vw,52px)] flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <h3 className="font-serif text-[clamp(1.4rem,2.2vw,1.9rem)] font-semibold text-text-primary">
              Latest from BlackNexa News
            </h3>
            <p className="mt-2 text-[12.5px] leading-[1.5] text-text-muted">
              Stories publish here as soon as the AI News Engine goes live.
            </p>
          </div>
          {newsArticles.length > 0 ? (
            <Link
              href="/news"
              className="text-[13.5px] text-text-secondary transition-colors hover:text-accent-text"
            >
              View all news →
            </Link>
          ) : null}
        </div>

        {newsArticles.length > 0 ? (
          <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[26px]">
            {newsArticles.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-[5px] px-[30px] py-[clamp(44px,6vw,72px)] text-center">
            <span className="inline-flex rounded-[2px] border border-accent px-[9px] py-1 text-[11px] font-semibold tracking-[0.16em] text-accent-text">
              COMING SOON
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
