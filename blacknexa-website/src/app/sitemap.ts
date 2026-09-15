import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/site";
import { getNewsArticles } from "@/data/news";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/contact", "/privacy", "/terms", "/disclaimer", "/news"];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/news" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/news" ? 0.8 : 0.6,
  }));

  // Article URLs are never hardcoded — pulled live from the backend so the
  // sitemap always matches what's actually published. Falls back to just the
  // static routes above if the news API is unset or unreachable.
  const articles = await getNewsArticles(100);
  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${siteConfig.url}/news/${a.slug}`,
    lastModified: new Date(a.publishedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticEntries, ...articleEntries];
}
