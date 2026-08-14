/**
 * Local news ranking — scores existing articles against a reader's geography.
 *
 * Ported from the Worker's `_lib/local.ts`. The app sends a one-shot location fix
 * (`lat`, `lng`, `city`, `region`, `country`) and this service:
 *   1. Builds weighted location tokens — city outranks region outranks country,
 *      so an Atlanta story beats a "United States" story for an Atlanta reader.
 *   2. Scores every article by where the tokens appear (headline > summary > body).
 *   3. Expands to neighbouring cities when home coverage is thin, tagging those
 *      results so the client can label them.
 *
 * Scoring weights are load-bearing: changing them reorders every reader's feed.
 */

import type {
  LocalNewsRequest,
  NewsArticle,
  RankedLocalArticle,
} from "@/types/news.interface";
import { CITY_ALIASES, NEARBY_CITIES, US_STATE_NAMES } from "@/data/geo_tokens.data";

interface WeightedToken {
  token: string;
  weight: number;
}

class LocalNewsService {
  /** Normalise a place name for matching: lowercase, strip punctuation, collapse space. */
  private norm(place: string | undefined): string {
    if (!place) return "";
    return place
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Build the weighted token set for the reader's own location. City is the
   * strongest signal (3), then region (2), then country (1); US state
   * abbreviations expand to full names and well-known city aliases are added.
   */
  locationTokens(req: LocalNewsRequest): WeightedToken[] {
    const out: WeightedToken[] = [];
    const push = (raw: string | undefined, weight: number): void => {
      const t = this.norm(raw);
      if (t && t.length > 1 && !out.some((o) => o.token === t)) {
        out.push({ token: t, weight });
      }
    };

    push(req.city, 3);
    push(req.region, 2);
    push(req.country, 1);

    // "GA" → "georgia", so a story that only spells the state out still matches.
    // US_STATE_NAMES is keyed uppercase.
    if (req.countryCode === "US" && req.region) {
      const full = US_STATE_NAMES[this.norm(req.region).toUpperCase()];
      if (full) push(full, 2);
    }

    // CITY_ALIASES is keyed lowercase. The Worker looked it up with
    // `.toUpperCase()`, so this expansion never fired — see the note in
    // `geo_tokens.data.ts`.
    for (const alias of CITY_ALIASES[this.norm(req.city)] ?? []) {
      push(alias, 2);
    }
    return out;
  }

  /**
   * Tokens for adjacent cities, all at weight 1 so a home-city story always
   * outranks a neighbouring one while thin coverage still fills the carousel.
   */
  nearbyTokens(req: LocalNewsRequest): WeightedToken[] {
    const out: WeightedToken[] = [];
    // NEARBY_CITIES is keyed lowercase, as is CITY_ALIASES below.
    const neighbors = NEARBY_CITIES[this.norm(req.city)];
    if (!neighbors) return out;

    const seen = new Set<string>();
    for (const raw of neighbors) {
      const t = this.norm(raw);
      if (!t || t.length <= 1 || seen.has(t)) continue;
      seen.add(t);
      out.push({ token: t, weight: 1 });

      // Pull in the neighbour's own aliases too, at the same low weight.
      for (const alias of CITY_ALIASES[t] ?? []) {
        const a = this.norm(alias);
        if (a && a.length > 1 && !seen.has(a)) {
          seen.add(a);
          out.push({ token: a, weight: 1 });
        }
      }
    }
    return out;
  }

  /**
   * Score an article purely on token matches — headline counts triple, summary
   * double, body single.
   *
   * Kept separate from the scope bonus because the two answer different questions:
   * this one answers "does this story mention the reader's place?", which is what
   * home-vs-nearby classification needs.
   */
  tokenScore(article: NewsArticle, tokens: WeightedToken[]): number {
    if (tokens.length === 0) return 0;
    const headline = this.norm(article.headline);
    const summary = this.norm(article.summary);
    const content = this.norm(article.content);

    let score = 0;
    for (const { token, weight } of tokens) {
      if (headline.includes(token)) score += weight * 3;
      if (summary.includes(token)) score += weight * 2;
      if (content.includes(token)) score += weight;
    }
    return score;
  }

  /**
   * Ranking score: token matches plus a small boost so local-scope stories still
   * surface when no explicit place name matched.
   *
   * Note this is deliberately **not** used for nearby classification. The +0.5
   * bonus applies to every local-scope article, so classifying on this value made
   * `nearby` permanently false for local stories — which are precisely the ones
   * the Nearby feature exists to surface. See `docs/MIGRATION_PLAN.md` §6.7.
   */
  scoreArticleForLocation(article: NewsArticle, tokens: WeightedToken[]): number {
    const score = this.tokenScore(article, tokens);
    if (article.scope === "local") return score + 0.5;
    return score;
  }

  /**
   * Rank and slice the feed by location relevance.
   *
   * Nearby expansion kicks in when the client asks for it, or automatically when
   * fewer than three home-city matches exist — that automatic fallback is what
   * keeps the local tab from rendering empty for a reader in a city with no
   * dedicated coverage yet.
   */
  rankLocalFeed(
    feed: NewsArticle[],
    req: LocalNewsRequest,
    limit = 8,
  ): RankedLocalArticle[] {
    const tokens = this.locationTokens(req);

    if (tokens.length === 0) {
      // No location info at all — fall back to local-scope articles by recency.
      return feed
        .filter((a) => a.scope === "local")
        .slice(0, limit)
        .map((a) => ({ article: a, nearby: false }));
    }

    const byRecency = (x: NewsArticle, y: NewsArticle): number =>
      new Date(y.publishedAt).getTime() - new Date(x.publishedAt).getTime();

    const home = feed
      .map((a) => ({ a, s: this.scoreArticleForLocation(a, tokens) }))
      .filter((x) => x.s > 0);

    const expandNearby = Boolean(req.nearby) || home.length < 3;

    if (!expandNearby) {
      return home
        .sort((x, y) => y.s - x.s || byRecency(x.a, y.a))
        .slice(0, limit)
        .map((x) => ({ article: x.a, nearby: false }));
    }

    const allTokens = [...tokens, ...this.nearbyTokens(req)];

    return feed
      .map((a) => {
        const s = this.scoreArticleForLocation(a, allTokens);
        // "Nearby" means the story matched only a neighbouring-city token and named
        // nothing in the reader's own area. Compared on `tokenScore`, not the
        // ranking score, so the local-scope bonus does not mask the distinction.
        const homeTokenScore = this.tokenScore(a, tokens);
        return { a, s, nearby: homeTokenScore === 0 && s > 0 };
      })
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || byRecency(x.a, y.a))
      .slice(0, limit)
      .map((x) => ({ article: x.a, nearby: x.nearby }));
  }

  /**
   * Build a grounded-generation search query scoped to the reader's area, used
   * when local coverage is thin enough to warrant generating a fresh briefing.
   */
  buildLocalPrompt(req: LocalNewsRequest): string {
    const place = [req.city, req.region, req.country].filter(Boolean).join(", ");
    const where = place || "my area";
    return `Black community news and developments in ${where} 2026 — local policy, business, education, faith, housing, or civic events affecting Black and Brown residents`;
  }
}

export const localNewsService = new LocalNewsService();
export default localNewsService;
