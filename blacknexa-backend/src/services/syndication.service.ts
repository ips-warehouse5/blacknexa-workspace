/**
 * Syndication feeds — RSS 2.0 (with MRSS and Atom extensions), Schema.org
 * JSON-LD, and the podcast/audio feed.
 *
 * Ported from the Worker's `_lib/syndication.ts`. Pure serialisation over the
 * article list; the RSS feed is what Google News and Apple News consume.
 */

import env from "@/config/env.config";
import { CATEGORY_LABELS, type NewsArticle } from "@/types/news.interface";

/** Minimal XML escaper — covers the characters that appear in news copy. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

class SyndicationService {
  private get origin(): string {
    return env.publicSiteOrigin;
  }

  /** RSS 2.0 with `media:content` (MRSS) and `atom:link` self-reference. */
  buildRssFeed(articles: NewsArticle[]): string {
    const items = articles
      .map((a) => {
        const link = `${this.origin}/news/${a.slug}`;
        return `    <item>
      <title>${xmlEscape(a.headline)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${toRfc822(a.publishedAt)}</pubDate>
      <category>${xmlEscape(CATEGORY_LABELS[a.category] ?? a.category)}</category>
      <description><![CDATA[${a.summary}]]></description>
      <media:content url="${xmlEscape(a.imageUrl)}" medium="image" width="1200" />
      <media:thumbnail url="${xmlEscape(a.imageUrl)}" width="1200" />
    </item>`;
      })
      .join("\n");

    const lastBuild = articles[0]
      ? toRfc822(articles[0].publishedAt)
      : toRfc822(new Date().toISOString());

    return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"
     xmlns:media="http://search.yahoo.com/mrss/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BlackNexa Global News Engine</title>
    <link>${this.origin}</link>
    <description>Factual, Godly news empowering Black and Brown communities worldwide.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${this.origin}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${this.origin}/assets/logo.png</url>
      <title>BlackNexa Global News Engine</title>
      <link>${this.origin}</link>
    </image>
${items}
  </channel>
</rss>
`;
  }

  /** Schema.org NewsArticle JSON-LD for a single article. */
  buildJsonLd(article: NewsArticle): string {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: article.headline,
      image: [article.imageUrl],
      datePublished: article.publishedAt,
      dateModified: article.publishedAt,
      author: [
        {
          "@type": "Organization",
          name: "Blacknexa AI News Engine",
          url: this.origin,
        },
      ],
      publisher: {
        "@type": "Organization",
        name: "Blacknexa",
        logo: { "@type": "ImageObject", url: `${this.origin}/assets/logo.png` },
      },
      description: article.summary,
      articleSection: CATEGORY_LABELS[article.category] ?? article.category,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${this.origin}/news/${article.slug}`,
      },
      citation: article.verifiedSources.map((s) => ({
        "@type": "CreativeWork",
        name: s.name,
        url: s.url,
      })),
    };
    return JSON.stringify(jsonLd, null, 2);
  }

  /**
   * Podcast / audio syndication feed, shaped for smart speakers and radio
   * syndicates. JSON is the most crawler-friendly baseline; an RSS-with-enclosures
   * serialiser can layer on top without changing this.
   */
  buildPodcastFeed(articles: NewsArticle[]): string {
    const feed = {
      title: "Blacknexa Daily Truth & Emancipation Briefing",
      podcastFeedUrl: `${this.origin}/rss/podcast.xml`,
      description:
        "Factual, Godly news empowering Black and Brown communities worldwide, grounded in Jehovah's Commandments and systemic equity.",
      language: "en-us",
      episodes: articles.map((a) => ({
        id: a.id,
        title: a.headline,
        audioUrl: a.audioUrl,
        duration: "03:30",
        summary: a.summary,
        biblicalAlignment: a.godlyPrincipleAlignment,
        publishedAt: a.publishedAt,
      })),
    };
    return JSON.stringify(feed, null, 2);
  }
}

export const syndicationService = new SyndicationService();
export default syndicationService;
