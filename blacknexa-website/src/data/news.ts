export type NewsArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  image?: string;
  publishedAt: string;
  category: string;
  sourcesCount: number;
  readTime: string;
};

export type NewsArticleDetail = NewsArticle & {
  content: string;
  author?: string;
  sources: { name: string; url: string }[];
};

/**
 * Shape of an article as returned by the BlackNexa backend
 * (`GET /api/v1/news/feed`, `GET /api/v1/news/article/:slug` — see
 * `blacknexa-backend/src/services/news.service.ts` `rowToArticle()`). Field
 * names and the `category` enum are a fixed contract shared with the mobile
 * apps — do not rename them to match the website's display type; map them
 * instead (see `mapBackendArticle` / `mapBackendArticleDetail` below).
 */
type BackendNewsCategory =
  | "business-wealth-stewardship"
  | "local-national-politics-civic"
  | "education-youth-advancement"
  | "clean-tech-and-advancements"
  | "faith-commandments-morality"
  | "hbcu-education"
  | "breaking-geopolitical"
  | "civil-rights-police-accountability";

type BackendNewsArticle = {
  id: string;
  slug: string;
  headline: string;
  category: BackendNewsCategory | string;
  summary: string;
  content: string;
  imageUrl: string;
  verifiedSources: { name: string; url: string }[];
  publishedAt: string;
  author?: string;
};

const CATEGORY_LABELS: Record<BackendNewsCategory, string> = {
  "business-wealth-stewardship": "Business & Wealth",
  "local-national-politics-civic": "Politics & Civic",
  "education-youth-advancement": "Education & Youth",
  "clean-tech-and-advancements": "Clean Tech",
  "faith-commandments-morality": "Faith & Morality",
  "hbcu-education": "HBCU Education",
  "breaking-geopolitical": "Breaking: Geopolitical",
  "civil-rights-police-accountability": "Civil Rights",
};

function categoryLabel(category: BackendNewsCategory | string): string {
  return CATEGORY_LABELS[category as BackendNewsCategory] ?? category;
}

const WORDS_PER_MINUTE = 200;

function estimateReadTime(content: string): string {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/** Maps a backend feed row to the website's display shape. */
function mapBackendArticle(a: BackendNewsArticle): NewsArticle {
  return {
    id: a.id,
    title: a.headline,
    slug: a.slug,
    excerpt: a.summary,
    image: a.imageUrl || undefined,
    publishedAt: a.publishedAt,
    category: categoryLabel(a.category),
    sourcesCount: a.verifiedSources?.length ?? 0,
    readTime: estimateReadTime(a.content),
  };
}

/** Maps a backend article-detail row to the website's article-page shape. */
function mapBackendArticleDetail(a: BackendNewsArticle): NewsArticleDetail {
  return {
    ...mapBackendArticle(a),
    content: a.content,
    author: a.author || undefined,
    sources: a.verifiedSources ?? [],
  };
}

/**
 * Base URL for the BlackNexa backend's news API, e.g.
 * `https://api.blacknexa.com/api/v1/news`. `/feed` and `/article/:slug` are
 * appended per call, mirroring the backend's actual route structure
 * (`blacknexa-backend/src/routes/news.route.ts`).
 */
function newsApiBase(): string | undefined {
  return process.env.NEWS_API_BASE_URL;
}

/**
 * Fetches the live feed from the BlackNexa backend and maps it to the
 * website's display shape. Returns an empty array (rendering the News
 * section's documented empty state) whenever `NEWS_API_BASE_URL` is unset or
 * the request fails — the newsroom is optional, not a page-breaking
 * dependency.
 */
export async function getNewsArticles(limit = 6): Promise<NewsArticle[]> {
  const base = newsApiBase();
  if (!base) return [];

  try {
    const res = await fetch(`${base}/feed?limit=${limit}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const body: { data?: BackendNewsArticle[] } = await res.json();
    return (body.data ?? []).map(mapBackendArticle);
  } catch {
    return [];
  }
}

/**
 * Fetches a single article by slug for the article detail page. Uncached
 * (`cache: "no-store"`) so the page always reflects the current published
 * state — article pages are rendered `force-dynamic` for the same reason.
 * Returns `null` when `NEWS_API_BASE_URL` is unset, the article does not
 * exist (404 from the backend), or the request fails.
 */
export async function getNewsArticleBySlug(slug: string): Promise<NewsArticleDetail | null> {
  const base = newsApiBase();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/article/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body: { data?: BackendNewsArticle } = await res.json();
    return body.data ? mapBackendArticleDetail(body.data) : null;
  } catch {
    return null;
  }
}
