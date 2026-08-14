/**
 * AI gateway facade — Exa web search, Gemini synthesis, image generation, TTS.
 *
 * The pipeline itself has moved to the Python service `blacknexa-ai-engine`. This
 * file is now a facade with two implementations behind one interface:
 *
 *   • **Engine path** — when `AI_ENGINE_URL` and `AI_ENGINE_TOKEN` are set, the AI
 *     work is delegated over HTTP. This is the intended production path.
 *   • **In-process path** — the original implementation, kept as a fallback. It
 *     runs when the engine is not configured, and when a configured engine is
 *     unreachable, so an engine outage degrades to the old behaviour instead of
 *     taking generation down.
 *
 * **Every public method signature is unchanged**, so `news.service.ts`,
 * `translation.service.ts` and `enterprise.service.ts` needed no edits at all.
 *
 * The pipeline's guarantees are unchanged because they are the product:
 *
 *   1. Exa search returns real, current results for the topic. These become the
 *      *only* sources the article may cite.
 *   2. Gemini synthesises a briefing constrained to those sources.
 *   3. Cited URLs are intersected with the actual hits, so a hallucinated — or
 *      injected — URL can never reach the feed.
 *   4. An image model produces a story-matching photojournalistic image.
 *
 * Two things deliberately stay here rather than moving to Python:
 *   • **Article identity** (`id`, `slug`, `contentHash`) — Node re-derives the hash
 *     on every read for feed dedup, so a second implementation would risk drift.
 *   • **`fallbackImage()` and the curated pools** — called synchronously for every
 *     article on every feed read; an HTTP hop per article would turn one query
 *     into fifty network calls.
 *
 * Every method degrades to `null`/`[]` rather than throwing, so a feed read never
 * fails because generation did.
 */

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import aiEngineClient from "@/services/ai_engine.client";
import {
  fetchWithRetry,
  fetchWithTimeout,
  extractJsonObject,
  safeHostname,
} from "@/utils/http.util";
import { articleContentHash, fnv1a } from "@/utils/hash.util";
import { slugify } from "@/utils/slug.util";
import { generatedArticleId } from "@/utils/id.util";
import { stripDataUri } from "@/utils/binary.util";
import { CATEGORY_IMAGES } from "@/data/category_images.data";
import { AI_AUTHOR, FACT_CHECK_VERIFIED, PLACEHOLDER_AUDIO_HOST } from "@/config/constants";
import type { NewsCategory, NewsScope, VerifiedSource } from "@/types/news.interface";
import type {
  ChatCompletionResponse,
  ExaHit,
  ExaResponse,
  FastGeneratedArticle,
  GenerateInput,
  GeneratedArticle,
  GeneratedAudio,
  GeneratedImage,
  SynthesisedArticle,
} from "@/types/ai.interface";

/**
 * Lowest-latency models available through the gateway. Kept identical to the
 * Worker's choices — the fast text model is what makes a user-facing briefing
 * return in ~2 seconds.
 */
const SYNTHESIS_MODEL = "google/gemini-2.5-flash-lite";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

const BASE_INSTRUCTION = `You are the Blacknexa AI News Portal engine. Your core purpose is to write 100% factual, verified news that empowers Black and Brown communities worldwide, grounded in Jehovah's Commandments and godly stewardship.

STRICT MORAL AND FACTUAL RULES:
1. Use ONLY the source material provided in the user message. Do not invent facts, names, dollar amounts, dates, or URLs that do not appear in the supplied search results.
2. If the source material is thin or contradictory, say so plainly in the summary rather than filling gaps with speculation.
3. Zero gossip, slander, sensationalism, crime glorification, or carnal clickbait.
4. Frame the story around integrity, economic emancipation, family building, trade mastery, and honest stewardship.
5. STRUCTURE DIRECTIVE: organise the "content" field in three movements, in this exact order — (1) LEAD: the verified core facts of the story up front; (2) CONTEXT & DATA: figures, dates, named stakeholders, statutes, dollar amounts, and background; (3) WHY IT MATTERS / GENERATIONAL IMPACT: close with the concrete stakes for Black and Brown communities and the generational impact of this story.

Be MORE explicit about the facts: name every program, official, dollar figure, date, location, and statute exactly as it appears in the sources. Quote directly when a source's wording is precise. Stay CONCISE in prose — no filler, no repetition, no rhetorical flourishes. Every sentence must carry a verified fact or a necessary logical bridge. Density over length.
Use plain journalistic paragraphs (no bullet lists, no subheads, no markdown). Vary sentence length for readability.

Output STRICTLY this JSON shape and nothing else:
{
  "headline": "A concise, factual headline (no clickbait, no exclamation marks)",
  "summary": "Two sentences summarising the verified facts.",
  "content": "{{LENGTH_RULE}}",
  "verifiedSources": [{"name": "Short publisher name (e.g. Reuters, AP, HUD.gov, Bloomberg)", "url": "exact URL from the sources"}], // List 5 to 7 verified sources so readers can trace every claim to its origin,
  "godlyPrincipleAlignment": "One sentence on how this story reflects industriousness, dignity, justice, or stewardship under God.",
  "imagePrompt": "A detailed photojournalistic image description depicting the specific subject matter of this story. Describe the scene, setting, people, objects, lighting, and composition as if briefing a professional photojournalist. No text overlays, no watermarks. Wide-angle, editorial, documentary style."
}`;

const DEPTH_RULE = `The "content" field MUST be a substantial, in-depth briefing of 2100 to 3200 words across 14 to 22 paragraphs. MANDATORY: Every story MUST state the EXACT geographic location (city, state, country) within the first two paragraphs — never use vague phrases like "a city" or "somewhere in". MANDATORY: Every story MUST name the REAL, SPECIFIC individuals involved — officials, organizers, attorneys, agency directors, community leaders — using their full names and titles as they appear in the sources. Every story MUST explicitly answer the five journalism questions — WHO is involved (name every person, organization, agency, and community affected with their full names and titles), WHAT happened (the specific action, decision, event, or policy), WHERE it took place (exact city, state, country, neighborhood, or institution — never approximate), WHEN it occurred (exact dates, timelines, and upcoming milestones), and WHY it matters (the underlying causes, stakes, and consequences for Black and Brown communities). Provide thorough context: explain who is affected, why it matters, what comes next, historical background, stakeholder perspectives, and any stated timeline or accountability mechanism. Include direct quotes from officials or documents when available. Name specific programs, dollar figures, dates, locations, and statutes. Dedicate at least one full paragraph to each of: background and history, immediate impact on the community, stakeholder and official responses, economic or legal implications, and forward-looking timeline or next steps. Each paragraph should introduce a new facet of the story — context, impact, stakeholders, timeline, analysis, and forward outlook.`;

const FAST_RULE = `The "content" field MUST be a fast, dense, fact-rich briefing of 525 to 975 words across 6 to 11 paragraphs. MANDATORY: State the EXACT geographic location (city, state, country) within the first paragraph. MANDATORY: Name the REAL individuals involved with their full names and titles. Every story MUST explicitly answer WHO (full names and titles), WHAT (specific action or event), WHERE (exact city, state, country), WHEN (exact dates), and WHY (stakes for Black and Brown communities). Pack every paragraph with verified facts, figures, names, dates, and places. Provide essential context, stakeholder impact, and a forward-looking sentence about what comes next. The goal is maximum factual density while still giving the reader substantive detail.`;

const SYSTEM_INSTRUCTION = BASE_INSTRUCTION.replace("{{LENGTH_RULE}}", DEPTH_RULE);
const FAST_SYSTEM_INSTRUCTION = BASE_INSTRUCTION.replace("{{LENGTH_RULE}}", FAST_RULE);

/** Per-category context injected into the image prompt when the model omits one. */
const CATEGORY_IMAGE_CONTEXT: Record<NewsCategory, string> = {
  "business-wealth-stewardship": "entrepreneurship, business, enterprise, economic empowerment",
  "local-national-politics-civic": "civic policy, government, community, legislation, public life",
  "education-youth-advancement": "education, youth, training, students, learning",
  "clean-tech-and-advancements": "clean technology, innovation, infrastructure, green energy",
  "faith-commandments-morality": "faith, community, family, moral leadership, dignity",
  "hbcu-education": "HBCU campus, historically Black university, students, academic excellence",
  "breaking-geopolitical": "world events, geopolitics, international affairs, global impact",
  "civil-rights-police-accountability":
    "civil rights, police accountability, anti-discrimination, justice, legal action",
};

class AiGatewayService {
  /**
   * True when an AI call can actually be made, by either path.
   *
   * `news.service.ts` gates the whole generation surface on this, so it must be
   * true when only the Python engine is configured — that is the normal production
   * shape, where the toolkit secret lives in the engine and not here.
   */
  get isEnabled(): boolean {
    return env.ai.enabled || aiEngineClient.isConfigured;
  }

  /** True when the in-process fallback can run. */
  private get isLocalEnabled(): boolean {
    return env.ai.enabled;
  }

  private get baseUrl(): string {
    return env.ai.toolkitUrl;
  }

  private get authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ai.secretKey}`,
    };
  }

  // ── Stage 1: web search ────────────────────────────────────────────────────

  /**
   * Search the live web for current, sourceable material on a topic.
   *
   * Delegates to the Python engine when it is configured; otherwise runs the
   * in-process implementation below. Returns `[]` on failure either way — callers
   * treat an empty result as "no grounding available", never as an error.
   */
  async searchWeb(query: string, numResults = 6, maxCharacters = 1200): Promise<ExaHit[]> {
    if (aiEngineClient.isConfigured) {
      const hits = await aiEngineClient.searchWeb(query, numResults, maxCharacters);
      // `null` means the engine call itself failed; fall through to the local
      // path so a briefing is still attempted.
      if (hits !== null) return hits;
      logger.warn("[ai] engine search failed — falling back to the in-process path");
    }

    if (!this.isLocalEnabled) return [];

    const data = await fetchWithRetry<ExaResponse>(
      `${this.baseUrl}/v2/exa/search`,
      {
        method: "POST",
        headers: this.authHeaders,
        body: JSON.stringify({
          query,
          type: "auto",
          numResults,
          contents: {
            highlights: true,
            text: { maxCharacters },
          },
        }),
      },
      (res) => res.json() as Promise<ExaResponse>,
    );
    return data?.results ?? [];
  }

  // ── Stage 2: synthesis ─────────────────────────────────────────────────────

  /** Ask the synthesis model to write a briefing constrained to the Exa hits. */
  private async synthesise(
    input: GenerateInput,
    hits: ExaHit[],
    fast: boolean,
  ): Promise<SynthesisedArticle | null> {
    if (!this.isLocalEnabled) return null;

    const sourcesBlock = hits
      .map((h, i) => {
        const date = h.publishedDate ? ` (published ${h.publishedDate.slice(0, 10)})` : "";
        const hl = (h.highlights ?? []).slice(0, 2).join(" ");
        return `SOURCE ${i + 1}${date}\ntitle: ${h.title ?? "Untitled"}\nurl: ${h.url}\nexcerpt: ${hl}`;
      })
      .join("\n\n");

    const userPrompt = `Topic: ${input.topicPrompt}
Category: ${input.category}
Scope: ${input.scope}

Use ONLY the sources below. Cite each fact with the source URL. Do not add any source that is not in this list.

${sourcesBlock}`;

    const data = await fetchWithRetry<ChatCompletionResponse>(
      `${this.baseUrl}/v2/vercel/v1/chat/completions`,
      {
        method: "POST",
        headers: this.authHeaders,
        body: JSON.stringify({
          model: SYNTHESIS_MODEL,
          messages: [
            { role: "system", content: fast ? FAST_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: fast ? 2800 : 7200,
        }),
      },
      (res) => res.json() as Promise<ChatCompletionResponse>,
    );
    if (!data) return null;

    const content = data.choices?.[0]?.message?.content ?? "";
    return extractJsonObject<SynthesisedArticle>(
      content,
      (parsed) => Boolean(parsed.headline && parsed.summary),
    );
  }

  /**
   * Keep only the sources whose URL actually came from Exa, attaching each hit's
   * excerpt and publication date. This is the anti-hallucination guardrail: a
   * URL the model invented is dropped, and if nothing survives, the top Exa hits
   * are used directly so the card always carries real, traceable links.
   */
  private filterSources(
    cited: { name: string; url: string }[] | undefined,
    hits: ExaHit[],
  ): VerifiedSource[] {
    const hitMap = new Map<string, ExaHit>();
    for (const h of hits) hitMap.set(h.url, h);

    const fromHits = (): VerifiedSource[] =>
      hits.slice(0, 7).map((h) => ({
        name: h.title ?? safeHostname(h.url),
        url: h.url,
        excerpt: (h.highlights ?? []).slice(0, 2).join(" ").trim() || undefined,
        publishedDate: h.publishedDate?.slice(0, 10) || undefined,
      }));

    if (!cited || cited.length === 0) return fromHits();

    const known = new Set(hits.map((h) => h.url));
    const cleaned = cited
      .filter((s) => s?.url && known.has(s.url))
      .map((s) => {
        const hit = hitMap.get(s.url);
        return {
          name: s.name || safeHostname(s.url),
          url: s.url,
          excerpt: (hit?.highlights ?? []).slice(0, 2).join(" ").trim() || undefined,
          publishedDate: hit?.publishedDate?.slice(0, 10) || undefined,
        };
      });

    return cleaned.length > 0 ? cleaned : fromHits();
  }

  // ── Stage 3: imagery ───────────────────────────────────────────────────────

  /** Derive a photojournalistic prompt when the synthesiser omitted one. */
  private fallbackImagePrompt(
    headline: string,
    category: NewsCategory,
    scope: NewsScope,
  ): string {
    const scopeContext = scope === "global" ? "international" : scope;
    return `Professional photojournalistic editorial news photograph depicting: ${headline}. Context: ${CATEGORY_IMAGE_CONTEXT[category]}. Scope: ${scopeContext}. Documentary style, natural lighting, realistic, high detail, wide-angle composition. No text overlays, no watermarks, no logos. Quality: Associated Press / New York Times / Bloomberg photo desk standard.`;
  }

  /**
   * Generate a unique, story-matching image. Returns `null` on any failure —
   * the caller then falls back to a curated photo, so the feed never shows a
   * broken thumbnail.
   */
  async generateArticleImage(
    imagePrompt: string,
    headline: string,
    category: NewsCategory,
    scope: NewsScope,
  ): Promise<GeneratedImage | null> {
    if (aiEngineClient.isConfigured) {
      const image = await aiEngineClient.generateImage({
        headline,
        category,
        scope,
        imagePrompt,
      });
      // A null here is indistinguishable from "the model produced no image", which
      // is a normal outcome — the caller falls back to a curated photo either way.
      if (image) return image;
    }

    if (!this.isLocalEnabled) return null;

    const prompt = imagePrompt?.trim() || this.fallbackImagePrompt(headline, category, scope);

    const res = await fetchWithTimeout(`${this.baseUrl}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: this.authHeaders,
      body: JSON.stringify({
        model: IMAGE_MODEL,
        modalities: ["text", "image"],
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });
    if (!res) return null;

    if (!res.ok) {
      const errText = await res.text().catch(() => "<no body>");
      logger.warn("[ai] image generation non-ok", {
        status: res.status,
        bodyPreview: errText.slice(0, 300),
      });
      return null;
    }

    const data = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
    const message = data?.choices?.[0]?.message;
    if (!message) {
      logger.warn("[ai] image generation returned no message");
      return null;
    }

    // Gateways vary: images arrive as bare strings, as {image_url:{url}}, or
    // embedded as a data URI inside the text content. All three are handled.
    for (const img of message.images ?? []) {
      const extracted = this.extractImage(img);
      if (extracted) return extracted;
    }
    if (message.content) {
      const match = message.content.match(
        /data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)/,
      );
      if (match) return { base64: match[2], mediaType: match[1] };
    }

    logger.warn("[ai] image generation returned no image payload", {
      imageCount: (message.images ?? []).length,
      hasContent: Boolean(message.content),
    });
    return null;
  }

  /** Pull base64 + media type out of one image entry. */
  private extractImage(
    img: string | { type?: string; image_url?: { url?: string } },
  ): GeneratedImage | null {
    const raw = typeof img === "string" ? img : img?.image_url?.url;
    if (!raw) return null;
    const { mediaType, base64 } = stripDataUri(raw);
    if (mediaType) return { base64, mediaType };
    // Some providers return raw base64 with no data-URI prefix.
    if (/^[A-Za-z0-9+/]{100,}={0,2}$/.test(base64)) {
      return { base64, mediaType: "image/png" };
    }
    return null;
  }

  // ── Audio ──────────────────────────────────────────────────────────────────

  /**
   * Build a spoken script. The briefing includes a generous slice of the body so
   * listeners get substance rather than a two-sentence teaser.
   */
  buildSpokenScript(headline: string, summary: string, content?: string): string {
    const lead = `${headline}. ${summary}`;
    if (content && content.trim()) {
      const excerpt = content.trim().split(/\s+/).slice(0, 800).join(" ");
      return `${lead}. ${excerpt}`.replace(/\s+/g, " ").trim();
    }
    return lead.replace(/\s+/g, " ").trim();
  }

  /** Generate an MP3 audio briefing via the gateway's TTS endpoint. */
  async generateArticleAudio(headline: string, summary: string): Promise<GeneratedAudio | null> {
    if (aiEngineClient.isConfigured) {
      const audio = await aiEngineClient.generateAudio({ headline, summary });
      if (audio) return audio;
    }

    if (!this.isLocalEnabled) return null;

    const script = this.buildSpokenScript(headline, summary);
    const res = await fetchWithTimeout(`${this.baseUrl}/v2/vercel/v4/ai/speech-model`, {
      method: "POST",
      headers: {
        ...this.authHeaders,
        "ai-model-id": "xai/grok-tts",
        "ai-gateway-protocol-version": "0.0.1",
      },
      body: JSON.stringify({ text: script, voice: "eve", outputFormat: "mp3" }),
    });
    if (!res) return null;

    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      logger.warn("[ai] tts non-ok", { status: res.status, bodyPreview: body.slice(0, 200) });
      return null;
    }
    const data = (await res.json().catch(() => null)) as { audio?: string } | null;
    if (!data?.audio || typeof data.audio !== "string") return null;
    return { base64: data.audio, mediaType: "audio/mpeg" };
  }

  // ── Curated fallback imagery ───────────────────────────────────────────────

  /**
   * Pick a deterministic fallback photo from the category pool.
   *
   * The seed includes the article id, so a given article always resolves to the
   * same photo — which is why the hash and the pool ordering in
   * `category_images.data.ts` must not be changed: existing articles would
   * silently swap thumbnails.
   */
  fallbackImage(
    category: NewsCategory,
    slug: string,
    headline?: string,
    id?: string,
  ): string {
    const pool = CATEGORY_IMAGES[category] ?? CATEGORY_IMAGES["business-wealth-stewardship"];
    const seed = id ? `${id}:${slug}:${headline ?? slug}` : `${slug}:${headline ?? slug}`;
    const h = fnv1a(seed);
    const base = pool[h % pool.length];
    // Stable cache-bust so the network layer treats each article's image as distinct.
    const suffix = `&sig=${h}`;
    return base.includes("?") ? base + suffix : base + "?" + suffix.slice(1);
  }

  // ── Full pipelines ─────────────────────────────────────────────────────────

  /**
   * Depth path — used by the daily batch. Waits for the unique AI image so the
   * published article is complete on first read.
   */
  async generateGroundedArticle(input: GenerateInput): Promise<GeneratedArticle | null> {
    const result = await this.generateCore(input, false);
    return result && "imageBase64" in result ? (result as GeneratedArticle) : null;
  }

  /**
   * Fast path — used by the user-facing briefing engine. Returns a publishable
   * article in a couple of seconds with a curated fallback image; the caller
   * generates the unique image, audio and translations in the background so the
   * user never waits on them.
   */
  async generateGroundedArticleFast(
    input: GenerateInput,
  ): Promise<FastGeneratedArticle | null> {
    const result = await this.generateCore(input, true);
    return result && "imagePending" in result ? (result as FastGeneratedArticle) : null;
  }

  private async generateCore(
    input: GenerateInput,
    fast: boolean,
  ): Promise<GeneratedArticle | FastGeneratedArticle | null> {
    // Delegate the AI work to the Python engine when it is configured. It returns
    // the synthesis result — headline, body, verified sources, optional image —
    // and this method assembles the article around it, exactly as it does for the
    // in-process path below. Article identity and the curated fallback pools
    // therefore stay here, in one place.
    if (aiEngineClient.isConfigured) {
      const assembled = await this.generateViaEngine(input, fast);
      if (assembled !== undefined) return assembled;
      logger.warn("[ai] engine synthesis unavailable — falling back to the in-process path");
    }

    const hits = await this.searchWeb(input.topicPrompt, fast ? 8 : 12, fast ? 800 : 2400);
    if (hits.length === 0) return null;

    const synth = await this.synthesise(input, hits, fast);
    if (!synth) return null;

    return this.assembleArticle(input, fast, {
      headline: synth.headline,
      summary: synth.summary,
      content: synth.content,
      godlyPrincipleAlignment: synth.godlyPrincipleAlignment,
      verifiedSources: this.filterSources(synth.verifiedSources, hits),
      imagePrompt: synth.imagePrompt,
    });
  }

  /**
   * Run generation through the Python engine.
   *
   * Returns the assembled article, `null` when the engine legitimately produced
   * nothing (no source material — the caller's 502 path), or `undefined` when the
   * engine itself was unreachable, which tells `generateCore` to retry locally.
   */
  private async generateViaEngine(
    input: GenerateInput,
    fast: boolean,
  ): Promise<GeneratedArticle | FastGeneratedArticle | null | undefined> {
    const result = await aiEngineClient.synthesize({
      topicPrompt: input.topicPrompt,
      category: input.category,
      scope: input.scope,
      mode: fast ? "fast" : "deep",
      includeImage: !fast,
    });

    // The client already distinguishes a 502 from a transport failure in its log;
    // here both surface as null, and falling back locally is safe either way.
    if (!result) return undefined;

    return this.assembleArticle(
      input,
      fast,
      {
        headline: result.headline,
        summary: result.summary,
        content: result.content,
        godlyPrincipleAlignment: result.godlyPrincipleAlignment,
        verifiedSources: result.verifiedSources,
        imagePrompt: result.imagePrompt,
      },
      result.image ?? undefined,
    );
  }

  /**
   * Build the `NewsArticle` from a synthesis result.
   *
   * Shared by both paths so the id format, slug, content hash, fallback image and
   * placeholder audio URL are produced identically no matter where the synthesis
   * came from.
   */
  private async assembleArticle(
    input: GenerateInput,
    fast: boolean,
    synth: {
      headline: string;
      summary: string;
      content: string;
      godlyPrincipleAlignment: string;
      verifiedSources: VerifiedSource[];
      imagePrompt?: string;
    },
    image?: GeneratedImage,
  ): Promise<GeneratedArticle | FastGeneratedArticle> {
    // Harden the payload: every NewsArticle field must be a real string, because
    // JSON.stringify drops undefined and the mobile decoders are strict.
    const summary = synth.summary?.trim() || "Briefing summary pending.";
    const content = synth.content?.trim() || summary;
    const godlyPrincipleAlignment =
      synth.godlyPrincipleAlignment?.trim() ||
      "Honest stewardship and factual clarity under God.";
    const verifiedSources = synth.verifiedSources;
    const id = generatedArticleId();
    const headline = synth.headline?.trim() || input.topicPrompt;
    const slug = slugify(headline) || `briefing-${Date.now()}`;
    const contentHash = articleContentHash(headline, summary, input.category, input.scope);
    const fallback = this.fallbackImage(input.category, slug, headline, id);

    const common = {
      id,
      slug,
      headline,
      category: input.category,
      scope: input.scope,
      summary,
      content,
      factCheckStatus: FACT_CHECK_VERIFIED,
      verifiedSources,
      godlyPrincipleAlignment,
      // Placeholder host, rewritten to the self-served endpoint on read once the
      // real TTS bytes exist. Preserved verbatim from the original.
      audioUrl: `https://${PLACEHOLDER_AUDIO_HOST}/audio/${id}.mp3`,
      publishedAt: new Date().toISOString(),
      author: AI_AUTHOR,
      contentHash,
    };

    if (fast) {
      return { ...common, imageUrl: fallback, imagePending: true };
    }

    // The engine returns the image inline on the deep path. Only generate one here
    // when it did not — i.e. on the in-process path, or when the engine's own image
    // call failed.
    const resolvedImage =
      image ??
      (await this.generateArticleImage(
        synth.imagePrompt ?? "",
        headline,
        input.category,
        input.scope,
      )) ??
      undefined;

    return {
      ...common,
      // Empty means "serve from the media endpoint" — the read path rewrites it.
      imageUrl: resolvedImage ? "" : fallback,
      imageBase64: resolvedImage?.base64,
      imageMediaType: resolvedImage?.mediaType,
    };
  }
}

export const aiGatewayService = new AiGatewayService();
export default aiGatewayService;
