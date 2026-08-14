/**
 * SEO and syndication controller — robots.txt, sitemaps, RSS, JSON-LD, podcast
 * feed, and the server-rendered article page.
 *
 * Content types and `Cache-Control` values are preserved exactly from the Worker,
 * because crawlers and CDNs act on them: a wrong `Content-Type` on `rss.xml` will
 * stop Google News from parsing the feed at all.
 */

import type { Request, Response } from "express";
import newsService from "@/services/news.service";
import seoService from "@/services/seo.service";
import syndicationService from "@/services/syndication.service";
import { resolveOrigin } from "@/utils/origin.util";
import { validatedParams } from "@/middlewares/validate.middleware";
import { INDEXNOW_KEY } from "@/config/constants";

class SeoController {
  /** `GET /robots.txt` */
  async robots(_req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .set({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      })
      .send(seoService.buildRobotsTxt());
  }

  /**
   * `GET /blacknexanews2026indexnowkey.txt`
   *
   * IndexNow verifies ownership by fetching this file and comparing it to the key
   * submitted with each ping, so the body must be exactly the key.
   */
  async indexNowKey(_req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .set({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      })
      .send(INDEXNOW_KEY);
  }

  /** `GET /rss.xml` — RSS 2.0 + MRSS, consumed by Google News and Apple News. */
  async rss(req: Request, res: Response): Promise<void> {
    const articles = await newsService.getFeed({}, resolveOrigin(req));
    res
      .status(200)
      .set({
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      })
      .send(syndicationService.buildRssFeed(articles));
  }

  /** `GET /sitemap.xml` */
  async sitemap(req: Request, res: Response): Promise<void> {
    const articles = await newsService.getFeed({}, resolveOrigin(req));
    res
      .status(200)
      .set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600",
      })
      .send(seoService.buildSitemap(articles));
  }

  /** `GET /sitemap-news.xml` — the last 48 hours only, per the Google News spec. */
  async newsSitemap(req: Request, res: Response): Promise<void> {
    const articles = await newsService.getFeed({}, resolveOrigin(req));
    res
      .status(200)
      .set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600",
      })
      .send(seoService.buildNewsSitemap(articles));
  }

  /** `GET /sitemap-index.xml` — static, no database read. */
  async sitemapIndex(_req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      })
      .send(seoService.buildSitemapIndex());
  }

  /**
   * `GET /api/v1/news/:slug/schema.json`
   *
   * Falls back to the newest article when the slug is unknown, matching the
   * original's `?? articles[0]`.
   */
  async schemaJson(req: Request, res: Response): Promise<void> {
    const { slug } = validatedParams<{ slug: string }>(req);
    const decoded = decodeURIComponent(slug);
    const articles = await newsService.getFeed({}, resolveOrigin(req));
    const article = articles.find((a) => a.slug === decoded) ?? articles[0];

    if (!article) {
      res.status(404).type("text/plain").send("article not found");
      return;
    }

    res
      .status(200)
      .set({
        "Content-Type": "application/ld+json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      })
      .send(syndicationService.buildJsonLd(article));
  }

  /** `GET /api/v1/podcast/feed.json` — audio syndication for smart speakers. */
  async podcastFeed(req: Request, res: Response): Promise<void> {
    const articles = await newsService.getFeed({}, resolveOrigin(req));
    res
      .status(200)
      .set({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      })
      .send(syndicationService.buildPodcastFeed(articles));
  }

  /**
   * `GET /news/:slug` — server-rendered HTML for crawlers and social previews.
   *
   * Unlike `schema.json` this does **not** fall back to another article: serving a
   * different story under a requested URL would be a canonical-URL error and would
   * poison the index.
   */
  async articleHtml(req: Request, res: Response): Promise<void> {
    const { slug } = validatedParams<{ slug: string }>(req);
    const article = await newsService.getArticleBySlug(
      decodeURIComponent(slug),
      resolveOrigin(req),
    );

    if (!article) {
      res.status(404).type("text/plain").send("article not found");
      return;
    }

    res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      })
      .send(seoService.buildArticleHtml(article));
  }
}

export const seoController = new SeoController();
export default seoController;
