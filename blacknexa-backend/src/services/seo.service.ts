/**
 * SEO infrastructure — robots.txt, sitemaps, server-rendered article HTML, and
 * the instant-indexing pings.
 *
 * Ported from the Worker's `_lib/seo.ts`. Everything a crawler needs to discover,
 * index and rank an article: crawl rules, three sitemaps, Open Graph, Twitter
 * Card, canonical URL, Schema.org NewsArticle JSON-LD, and the full body copy in
 * semantic HTML so the text is extractable without JavaScript.
 */

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { CATEGORY_LABELS, type NewsArticle } from "@/types/news.interface";
import { INDEXNOW_KEY } from "@/config/constants";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ISO-8601 with seconds precision, as sitemap `lastmod` requires. */
function lastmod(iso: string): string {
  return iso.length > 19 ? iso.slice(0, 19) + "Z" : iso;
}

/**
 * Serialise JSON for embedding inside an inline `<script>` block.
 *
 * `JSON.stringify` alone is **not** safe here. An HTML parser terminates a script
 * element at the first literal `</script`, regardless of JSON string quoting — so a
 * headline containing `</script><script>…` would break out of the JSON-LD block
 * and execute. Article headlines are derived from a model prompted with
 * user-supplied text via the public `POST /api/v1/news/generate`, and this page is
 * then served to every visitor and crawler, which makes that a reachable stored
 * XSS vector.
 *
 * Escaping `<`, `>` and `&` as `\uXXXX` keeps the payload valid JSON — the parser
 * decodes them back to the original characters — while leaving no sequence an HTML
 * parser can act on. `U+2028`/`U+2029` are escaped too: they are valid in JSON but
 * are line terminators in JavaScript.
 */
/**
 * Characters replaced with their `\uXXXX` form, keyed by code point.
 *
 * Built from code points rather than written as literals so no invisible line
 * separator ever appears in this source file.
 */
const SCRIPT_UNSAFE_CODE_POINTS = [
  0x3c, // <  \u2014 closes the script element
  0x3e, // >
  0x26, // &  \u2014 could start an HTML entity in some parsing modes
  0x2028, // LINE SEPARATOR \u2014 a JS line terminator, though valid in JSON
  0x2029, // PARAGRAPH SEPARATOR
];

const SCRIPT_UNSAFE_PATTERN = new RegExp(
  `[${SCRIPT_UNSAFE_CODE_POINTS.map(
    (cp) => `\\u${cp.toString(16).padStart(4, "0")}`,
  ).join("")}]`,
  "gu",
);

function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    SCRIPT_UNSAFE_PATTERN,
    (ch) => `\\u${ch.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  );
}

class SeoService {
  /** The public site origin used in every canonical/self-referential URL. */
  private get origin(): string {
    return env.publicSiteOrigin;
  }

  private articlePath(slug: string): string {
    return `${this.origin}/news/${encodeURIComponent(slug)}`;
  }

  /**
   * Ping IndexNow (Bing / Yandex / Seznam / Naver) for instant indexing of newly
   * published URLs. Fire-and-forget: a failure is logged and never blocks a
   * publish.
   */
  async pingIndexNow(slugs: string[]): Promise<void> {
    if (!env.jobs.enableSearchEnginePing || slugs.length === 0) return;

    const body = {
      host: new URL(this.origin).host,
      key: INDEXNOW_KEY,
      keyLocation: `${this.origin}/${INDEXNOW_KEY}.txt`,
      urlList: slugs.map((s) => this.articlePath(s)),
    };

    const endpoints = [
      "https://api.indexnow.org/IndexNow",
      "https://www.bing.com/indexnow",
      "https://yandex.com/indexnow",
    ];

    await Promise.allSettled(
      endpoints.map(async (ep) => {
        try {
          const res = await fetch(ep, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(body),
          });
          if (!res.ok) logger.warn(`[indexnow] ${ep} returned ${res.status}`);
        } catch (err) {
          logger.warn(`[indexnow] ${ep} failed`, {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  /** Ask Google and Bing to re-fetch the sitemap after a publish. */
  async pingSitemapEngines(): Promise<void> {
    if (!env.jobs.enableSearchEnginePing) return;

    const sitemapUrl = encodeURIComponent(`${this.origin}/sitemap-index.xml`);
    const targets = [
      `https://www.google.com/ping?sitemap=${sitemapUrl}`,
      `https://www.bing.com/ping?sitemap=${sitemapUrl}`,
    ];
    await Promise.allSettled(
      targets.map(async (url) => {
        try {
          const res = await fetch(url, { method: "GET" });
          if (!res.ok) logger.warn(`[sitemap-ping] ${url} returned ${res.status}`);
        } catch (err) {
          logger.warn(`[sitemap-ping] ${url} failed`, {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  /**
   * robots.txt — open to every major crawler, with the binary image endpoint
   * excluded (nothing to index there) and all three sitemaps declared.
   */
  buildRobotsTxt(): string {
    return [
      "# BlackNexa News — open to all global search engines",
      "User-agent: *",
      "Allow: /",
      "Allow: /news/",
      "Allow: /rss.xml",
      "Disallow: /api/v1/news/image/",
      "",
      "# Major crawlers — explicit allow",
      ...[
        "Googlebot",
        "Googlebot-News",
        "Bingbot",
        "Slurp",
        "DuckDuckBot",
        "Baiduspider",
        "YandexBot",
        "Applebot",
        "AhrefsBot",
        "SemrushBot",
        "facebookexternalhit",
        "Twitterbot",
        "LinkedInBot",
      ].flatMap((ua) => [`User-agent: ${ua}`, "Allow: /"]),
      "",
      "# Sitemaps — global discovery",
      `Sitemap: ${this.origin}/sitemap-index.xml`,
      `Sitemap: ${this.origin}/sitemap-news.xml`,
      `Sitemap: ${this.origin}/rss.xml`,
      "",
    ].join("\n");
  }

  /** Standard sitemap with image and news extensions. */
  buildSitemap(articles: NewsArticle[]): string {
    const urls = articles
      .map((a) => {
        const link = this.articlePath(a.slug);
        const cat = CATEGORY_LABELS[a.category] ?? a.category;
        return `  <url>
    <loc>${xmlEscape(link)}</loc>
    <lastmod>${lastmod(a.publishedAt)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <news:image>
      <news:title>${xmlEscape(a.headline)}</news:title>
      <news:caption>${xmlEscape(a.summary)}</news:caption>
      <image:loc>${xmlEscape(a.imageUrl)}</image:loc>
    </news:image>
    <image:image>
      <image:loc>${xmlEscape(a.imageUrl)}</image:loc>
      <image:title>${xmlEscape(a.headline)}</image:title>
      <image:caption>${xmlEscape(a.summary)}</image:caption>
    </image:image>
    <video:video>
      <video:thumbnail_loc>${xmlEscape(a.imageUrl)}</video:thumbnail_loc>
      <video:title>${xmlEscape(a.headline)}</video:title>
      <video:description>${xmlEscape(a.summary)}</video:description>
    </video:video>
    <news:news>
      <news:publication>
        <news:name>BlackNexa</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${a.publishedAt}</news:publication_date>
      <news:title>${xmlEscape(a.headline)}</news:title>
      <news:keywords>${xmlEscape(cat)}</news:keywords>
    </news:news>
  </url>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>${this.origin}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${this.origin}/news</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
${urls}
</urlset>
`;
  }

  /**
   * Google News sitemap. Only the last 48 hours are eligible per the spec, so
   * older articles are filtered out rather than rejected by the crawler.
   */
  buildNewsSitemap(articles: NewsArticle[]): string {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const recent = articles.filter((a) => new Date(a.publishedAt).getTime() >= cutoff);

    const urls = recent
      .map((a) => {
        const link = this.articlePath(a.slug);
        const cat = CATEGORY_LABELS[a.category] ?? a.category;
        return `  <url>
    <loc>${xmlEscape(link)}</loc>
    <news:news>
      <news:publication>
        <news:name>BlackNexa</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${a.publishedAt}</news:publication_date>
      <news:title>${xmlEscape(a.headline)}</news:title>
      <news:keywords>${xmlEscape(cat)}</news:keywords>
      <news:stock_tickers></news:stock_tickers>
    </news:news>
  </url>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>
`;
  }

  /** Sitemap index pointing at all sitemaps. Static — no database read needed. */
  buildSitemapIndex(): string {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="utf-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${this.origin}/sitemap.xml</loc>
    <lastmod>${lastmod(now)}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${this.origin}/sitemap-news.xml</loc>
    <lastmod>${lastmod(now)}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${this.origin}/rss.xml</loc>
    <lastmod>${lastmod(now)}</lastmod>
  </sitemap>
</sitemapindex>
`;
  }

  /**
   * Server-rendered article page for crawlers and social previews.
   *
   * Carries canonical URL, Open Graph (Facebook / WhatsApp / LinkedIn / Reddit /
   * Pinterest), Twitter Card, Schema.org NewsArticle JSON-LD, the body as
   * semantic paragraphs, verified sources as outbound links, and the trademark
   * footer.
   */
  buildArticleHtml(article: NewsArticle): string {
    const url = this.articlePath(article.slug);
    const cat = CATEGORY_LABELS[article.category] ?? article.category;
    const pubDate = new Date(article.publishedAt).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const paragraphs = article.content
      .split(/\n\n+|\. (?=[A-Z])/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `    <p>${htmlEscape(p)}.</p>`)
      .join("\n");

    const sources = article.verifiedSources
      .map(
        (s) =>
          `      <li><a href="${htmlEscape(s.url)}" rel="nofollow noopener" target="_blank">${htmlEscape(s.name)}</a></li>`,
      )
      .join("\n");

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
          name: article.author || "BlackNexa AI News Engine",
          url: this.origin,
        },
      ],
      publisher: {
        "@type": "Organization",
        name: "BlackNexa",
        logo: { "@type": "ImageObject", url: `${this.origin}/assets/logo.png` },
      },
      description: article.summary,
      articleSection: cat,
      keywords: [cat, article.scope, "BlackNexa", "news"].join(", "),
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      citation: article.verifiedSources.map((s) => ({
        "@type": "CreativeWork",
        name: s.name,
        url: s.url,
      })),
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(article.headline)} | BlackNexa</title>
  <meta name="description" content="${htmlEscape(article.summary)}" />
  <meta name="keywords" content="${htmlEscape(cat)}, ${htmlEscape(article.scope)}, BlackNexa, news, ${htmlEscape(article.headline)}" />
  <meta name="author" content="${htmlEscape(article.author || "BlackNexa")}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="googlebot-news" content="index, follow" />
  <meta name="bingbot" content="index, follow" />
  <meta name="language" content="English" />
  <meta name="revisit-after" content="1 hour" />
  <meta name="rating" content="general" />
  <meta name="distribution" content="global" />

  <link rel="canonical" href="${url}" />
  <link rel="amphtml" href="${url}" />
  <link rel="alternate" type="application/rss+xml" title="BlackNexa RSS" href="${this.origin}/rss.xml" />
  <link rel="image_src" href="${htmlEscape(article.imageUrl)}" />

  <!-- Open Graph (Facebook, WhatsApp, LinkedIn, Reddit, Pinterest) -->
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="BlackNexa" />
  <meta property="og:title" content="${htmlEscape(article.headline)}" />
  <meta property="og:description" content="${htmlEscape(article.summary)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${htmlEscape(article.imageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="800" />
  <meta property="og:image:alt" content="${htmlEscape(article.headline)}" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:published_time" content="${article.publishedAt}" />
  <meta property="og:section" content="${htmlEscape(cat)}" />
  <meta property="article:published_time" content="${article.publishedAt}" />
  <meta property="article:section" content="${htmlEscape(cat)}" />
  <meta property="article:author" content="${htmlEscape(article.author || "BlackNexa")}" />
  <meta property="article:tag" content="${htmlEscape(cat)}" />
  <meta property="article:tag" content="BlackNexa" />
  <meta property="article:tag" content="${htmlEscape(article.scope)}" />

  <!-- Twitter Card (X) -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@blacknexa" />
  <meta name="twitter:creator" content="@blacknexa" />
  <meta name="twitter:title" content="${htmlEscape(article.headline)}" />
  <meta name="twitter:description" content="${htmlEscape(article.summary)}" />
  <meta name="twitter:image" content="${htmlEscape(article.imageUrl)}" />
  <meta name="twitter:image:alt" content="${htmlEscape(article.headline)}" />

  <!-- Schema.org NewsArticle JSON-LD -->
  <script type="application/ld+json">
${jsonForScriptTag(jsonLd)}
  </script>
</head>
<body>
  <article itemscope itemtype="https://schema.org/NewsArticle">
    <header>
      <h1 itemprop="headline">${htmlEscape(article.headline)}</h1>
      <p class="byline">
        By <span itemprop="author">${htmlEscape(article.author || "BlackNexa AI News Engine")}</span>
        &middot; <time datetime="${article.publishedAt}" itemprop="datePublished">${pubDate}</time>
        &middot; <span itemprop="articleSection">${htmlEscape(cat)}</span>
        &middot; ${htmlEscape(article.scope)}
      </p>
      <p class="status">${htmlEscape(article.factCheckStatus)}</p>
    </header>

    <figure>
      <img src="${htmlEscape(article.imageUrl)}" alt="${htmlEscape(article.headline)}" itemprop="image" width="1200" height="800" />
      <figcaption>${htmlEscape(article.summary)}</figcaption>
    </figure>

    <div itemprop="articleBody">
${paragraphs}
    </div>

    <p class="alignment" itemprop="text">${htmlEscape(article.godlyPrincipleAlignment)}</p>

    <section class="sources">
      <h2>Verified Sources</h2>
      <ul>
${sources}
      </ul>
    </section>

    <footer class="brand-auth">
      <p><strong>Published by BlackNexa&trade;</strong></p>
      <p>Truth &middot; Stewardship &middot; Dignity</p>
      <p class="verified">${htmlEscape(article.factCheckStatus)}</p>
      <p><a href="${url}">${url}</a></p>
      <hr/>
      <p class="tm-notice">BlackNexa&trade; is a trademark of BlackNexa, application pending with the United States Patent and Trademark Office (USPTO). All content, concepts, methodology, and intellectual property herein are the exclusive protected property of BlackNexa&trade; &mdash; including the Truth Verification Engine, Civic Checks &amp; Balances, and faith-grounded news framework. &copy; ${new Date().getUTCFullYear()} BlackNexa&trade;. All rights reserved. Unauthorized reproduction, syndication, or derivative use is prohibited.</p>
    </footer>
  </article>
</body>
</html>
`;
  }
}

export const seoService = new SeoService();
export default seoService;
