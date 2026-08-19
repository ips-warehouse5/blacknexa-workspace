import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  articleContentHash,
  SEED_NEWS,
  slugify,
  type NewsArticle,
  type NewsCategory,
  type NewsScope,
} from "@/mocks/news";
import { type ArticleTranslation, type LanguageCode } from "@/constants/i18n";
import { apiClient, FUNCTIONS_URL } from "@/utils/apiClient";

const FEED_STALE_MS = 60_000;
const SEARCH_STALE_MS = 60_000;
const TRANSLATION_STALE_MS = 5 * 60_000;

export type GenerateNewsInput = {
  topicPrompt: string;
  category: NewsCategory;
  scope: NewsScope;
  /** Optional verified source URLs — when 3+ are provided, the enterprise
   * verified-story endpoint is used instead of the AI generation path. */
  verifiedSourceUrls?: string[];
  /** Reader's native language — the Worker returns the briefing translated
   * on-the-fly so the story arrives natively in one round trip. */
  language?: LanguageCode;
};

type FeedResponse = {
  success: boolean;
  data?: NewsArticle[];
  count?: number;
  error?: string;
};

type BriefingsResponse = {
  success: boolean;
  data?: NewsArticle[];
  count?: number;
  error?: string;
};

export type GenerateNewsResult = {
  success: boolean;
  article?: NewsArticle;
  translation?: ArticleTranslation;
  error?: string;
};

type TranslationResponse = {
  success: boolean;
  data?: ArticleTranslation;
  cached?: boolean;
  background?: boolean;
  error?: string;
};

async function fetchFeed(signal?: AbortSignal): Promise<NewsArticle[]> {
  if (!FUNCTIONS_URL) {
    return SEED_NEWS;
  }
  try {
    const json = await apiClient<FeedResponse>("/api/v1/news/feed", {
      params: { limit: 50 },
      signal,
    });
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error ?? "Malformed feed response.");
    }
    return json.data;
  } catch {
    return SEED_NEWS;
  }
}

async function fetchSearch(
  query: string,
  signal?: AbortSignal
): Promise<NewsArticle[]> {
  if (!FUNCTIONS_URL) {
    const q = query.toLowerCase();
    return SEED_NEWS.filter(
      (a) => a.headline.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
    );
  }
  try {
    const json = await apiClient<FeedResponse>("/api/v1/news/feed", {
      params: { search: query, limit: 50 },
      signal,
    });
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error ?? "Malformed search response.");
    }
    return json.data;
  } catch {
    const q = query.toLowerCase();
    return SEED_NEWS.filter(
      (a) => a.headline.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
    );
  }
}

async function fetchBriefings(signal?: AbortSignal): Promise<NewsArticle[]> {
  if (!FUNCTIONS_URL) {
    return SEED_NEWS.slice(0, 3);
  }
  try {
    const json = await apiClient<BriefingsResponse>("/api/v1/news/briefings", {
      signal,
    });
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error ?? "Malformed briefings response.");
    }
    return json.data;
  } catch {
    return SEED_NEWS.slice(0, 3);
  }
}

async function generateViaWorker(
  input: GenerateNewsInput
): Promise<GenerateNewsResult> {
  if (!FUNCTIONS_URL) {
    throw new Error(
      "News backend is not configured. Set EXPO_PUBLIC_RORK_FUNCTIONS_URL to enable AI generation."
    );
  }

  const sources = input.verifiedSourceUrls?.filter((u) => u.trim().length > 0) ?? [];
  if (sources.length >= 3) {
    const body = await apiClient<{ success?: boolean; article?: any; error?: string }>(
      "/api/v1/blacknexa/publish-verified-story",
      {
        method: "POST",
        body: JSON.stringify({
          topic: input.topicPrompt,
          category: input.category,
          targetLocation: "United States",
          keyIndividuals: [],
          rawFacts: input.topicPrompt,
          verifiedSources: sources.slice(0, 10),
        }),
      }
    );

    if (!body?.success) {
      throw new Error(body?.error ?? "Verified story submission failed.");
    }
    const ent = body.article;
    if (!ent) throw new Error("Verified story response was malformed.");
    const article: NewsArticle = {
      id: `ent-${ent.id}`,
      slug: `verified-${ent.id}`,
      headline: ent.title,
      category: input.category,
      scope: input.scope,
      summary: ent.content.slice(0, 200) + "…",
      content: ent.content,
      imageUrl: "",
      factCheckStatus: "Fact-Verified · 3+ Sources Cross-Referenced",
      verifiedSources: (ent.verifiedSources || []).map((s: any) => ({ name: s.name, url: s.url })),
      godlyPrincipleAlignment: "Upholds faith-grounded truth and civic accountability.",
      audioUrl: "",
      publishedAt: ent.timestamp || new Date().toISOString(),
      author: "BlackNexa Verified Briefing",
    };
    return { success: true, article };
  }

  const body = await apiClient<{ success?: boolean; article?: NewsArticle; translation?: ArticleTranslation; error?: string }>(
    "/api/v1/news/generate",
    {
      method: "POST",
      body: JSON.stringify({
        topicPrompt: input.topicPrompt,
        category: input.category,
        scope: input.scope,
        language: input.language ?? "en",
      }),
    }
  );

  if (!body?.success || !body.article) {
    throw new Error(body?.error ?? "Generation failed.");
  }
  return { success: true, article: body.article, translation: body.translation };
}

/**
 * Fetch a translated view of an article from the Worker. The Worker caches
 * translations in its Durable Object, so a second read of the same article in
 * the same language is instant and free. `lang=en` returns the source text.
 *
 * If the translation is not yet cached, the Worker returns the English source
 * immediately with `background: true` and generates the translation in the
 * background. The caller can poll again after a short delay to pick up the
 * cached translation.
 */
export /**
 * Normalize a headline for deduplication: lowercase, strip punctuation,
 * collapse whitespace. This catches generated variants that end up with
 * different slugs but the same core headline.
 */
function normalizedHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a content hash for an article, computing it if the backend did not send one. */
function contentHashOf(a: NewsArticle): string {
  return a.contentHash ?? articleContentHash(a.headline, a.summary, a.category, a.scope);
}

async function fetchTranslation(
  slug: string,
  language: LanguageCode,
  signal?: AbortSignal
): Promise<ArticleTranslation & { background?: boolean }> {
  if (!FUNCTIONS_URL) {
    throw new Error(
      "News backend is not configured. Set EXPO_PUBLIC_RORK_FUNCTIONS_URL to enable translation."
    );
  }

  const body = await apiClient<TranslationResponse>(
    `/api/v1/news/translate/${encodeURIComponent(slug)}`,
    {
      params: { lang: language },
      signal,
    }
  );

  if (!body?.success || !body.data) {
    const msg = body?.error ?? "Translation failed.";
    throw new Error(msg);
  }
  return { ...body.data, background: body.background ?? false };
}

import { useSettings } from "@/providers/SettingsProvider";
import { LEGAL_VERSION } from "@/constants/legal";

export const [NewsProvider, useNews] = createContextHook(() => {
  const qc = useQueryClient();
  const { settings } = useSettings();

  const isConsented = Boolean(
    settings.consentTos &&
    settings.consentPrivacy &&
    settings.consentVersion >= LEGAL_VERSION
  );

  const feedQuery = useQuery<NewsArticle[], Error>({
    queryKey: ["news_feed"],
    queryFn: ({ signal }) => fetchFeed(signal),
    enabled: isConsented,
    staleTime: FEED_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const feed = useMemo<NewsArticle[]>(() => {
    const remote = feedQuery.data ?? [];
    // If the Worker returns nothing (empty store pre-seed), keep the tab usable.
    const source = remote.length > 0 ? remote : SEED_NEWS;
    // Deduplicate by id, slug, normalized headline, and content hash so the feed
    // never renders the same briefing twice, even when the AI generated variants.
    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const seenHeadlines = new Set<string>();
    const seenHashes = new Set<string>();
    return source.filter((a) => {
      const norm = normalizedHeadline(a.headline);
      const hash = contentHashOf(a);
      if (
        seenIds.has(a.id) ||
        seenSlugs.has(a.slug) ||
        seenHeadlines.has(norm) ||
        seenHashes.has(hash)
      ) return false;
      seenIds.add(a.id);
      seenSlugs.add(a.slug);
      seenHeadlines.add(norm);
      seenHashes.add(hash);
      return true;
    });
  }, [feedQuery.data]);

  const briefingsQuery = useQuery<NewsArticle[], Error>({
    queryKey: ["news_briefings"],
    queryFn: ({ signal }) => fetchBriefings(signal),
    enabled: isConsented,
    staleTime: SEARCH_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const briefings = useMemo<NewsArticle[]>(() => {
    const remote = briefingsQuery.data ?? [];
    const source = remote.length > 0 ? remote : SEED_NEWS.slice(0, 3);
    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const seenHeadlines = new Set<string>();
    const seenHashes = new Set<string>();
    return source.filter((a) => {
      const norm = normalizedHeadline(a.headline);
      const hash = contentHashOf(a);
      if (
        seenIds.has(a.id) ||
        seenSlugs.has(a.slug) ||
        seenHeadlines.has(norm) ||
        seenHashes.has(hash)
      ) return false;
      seenIds.add(a.id);
      seenSlugs.add(a.slug);
      seenHeadlines.add(norm);
      seenHashes.add(hash);
      return true;
    });
  }, [briefingsQuery.data]);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchQueryObj = useQuery<NewsArticle[], Error>({
    queryKey: ["news_search", searchQuery],
    queryFn: ({ signal }) => fetchSearch(searchQuery, signal),
    staleTime: SEARCH_STALE_MS,
    enabled: searchQuery.trim().length > 0,
    retry: 1,
  });

  const searchResults = useMemo<NewsArticle[]>(() => {
    const remote = searchQueryObj.data ?? [];
    if (searchQuery.trim().length === 0) return feed;
    const source = remote.length > 0 ? remote : SEED_NEWS.filter(
      (a) =>
        a.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.summary.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const seenHeadlines = new Set<string>();
    const seenHashes = new Set<string>();
    return source.filter((a) => {
      const norm = normalizedHeadline(a.headline);
      const hash = contentHashOf(a);
      if (
        seenIds.has(a.id) ||
        seenSlugs.has(a.slug) ||
        seenHeadlines.has(norm) ||
        seenHashes.has(hash)
      ) return false;
      seenIds.add(a.id);
      seenSlugs.add(a.slug);
      seenHeadlines.add(norm);
      seenHashes.add(hash);
      return true;
    });
  }, [searchQueryObj.data, searchQuery, feed]);

  const runSearch = useCallback((query: string) => {
    setSearchQuery(query.trim());
  }, []);

  const isSearching = searchQuery.trim().length > 0 && searchQueryObj.isFetching;

  const generateMutation = useMutation({
    mutationFn: generateViaWorker,
    onSuccess: ({ article, translation }) => {
      if (!article) return;
      // Seed the translation cache so opening the article shows it natively
      // in the reader's language with zero extra network calls.
      if (translation && translation.language !== "en") {
        qc.setQueryData<ArticleTranslation & { background?: boolean }>(
          ["news_translation", article.slug, translation.language],
          { ...translation, background: false }
        );
      }
      // Prepend the new article and mark the feed fresh so the UI re-renders.
      qc.setQueryData<NewsArticle[]>(["news_feed"], (prev) => {
        if (!prev) return [article];
        const next = [article, ...prev];
        const seenIds = new Set<string>();
        const seenSlugs = new Set<string>();
        const seenHeadlines = new Set<string>();
        const seenHashes = new Set<string>();
        return next.filter((a): a is NewsArticle => {
          if (!a) return false;
          const norm = normalizedHeadline(a.headline);
          const hash = contentHashOf(a);
          if (
            seenIds.has(a.id) ||
            seenSlugs.has(a.slug) ||
            seenHeadlines.has(norm) ||
            seenHashes.has(hash)
          ) return false;
          seenIds.add(a.id);
          seenSlugs.add(a.slug);
          seenHeadlines.add(norm);
          seenHashes.add(hash);
          return true;
        });
      });
    },
  });

  const getById = useCallback(
    (id: string) => feed.find((a) => a.id === id || a.slug === id),
    [feed]
  );

  /**
   * Fetch a translation for the given slug + language. Results are cached
   * in React Query per (slug, language) so switching back is instant and the
   * app does not refetch the same translation on every article visit. Pass an
   * AbortSignal so a stale request can be cancelled when the user picks a new
   * language.
   */
  const fetchTranslationFor = useCallback(
    async (
      slug: string,
      language: LanguageCode,
      signal?: AbortSignal
    ): Promise<ArticleTranslation & { background?: boolean }> => {
      // English is the source language — return a synthetic translation
      // from the article already in the feed, no network call needed.
      if (language === "en") {
        const article = feed.find((a) => a.slug === slug);
        if (article) {
          return {
            language: "en",
            headline: article.headline,
            summary: article.summary,
            content: article.content,
            godlyPrincipleAlignment: article.godlyPrincipleAlignment,
            translatedAt: article.publishedAt,
          };
        }
      }
      return qc.fetchQuery<ArticleTranslation & { background?: boolean }, Error>({
        queryKey: ["news_translation", slug, language],
        queryFn: ({ signal: querySignal }) => fetchTranslation(slug, language, querySignal),
        staleTime: TRANSLATION_STALE_MS,
      });
    },
    [feed, qc]
  );

  return {
    feed,
    briefings,
    isLoading: feedQuery.isLoading,
    isRefetching: feedQuery.isFetching && !feedQuery.isLoading,
    feedError: feedQuery.error,
    refetch: feedQuery.refetch,
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    generateError: generateMutation.error,
    getById,
    fetchTranslationFor,
    /** Slug helper kept for callers that build local URLs. */
    slugify,
    // Backend-powered search engine.
    searchQuery,
    searchResults,
    runSearch,
    isSearching,
    // Manual refresh of the briefings series.
    refetchBriefings: briefingsQuery.refetch,
  };
});
