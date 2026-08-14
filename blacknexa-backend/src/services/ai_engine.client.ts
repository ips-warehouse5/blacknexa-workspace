/**
 * Client for the Python AI news engine (`blacknexa-ai-engine`).
 *
 * The AI generation pipeline — grounded search, briefing synthesis, imagery, TTS
 * and translation — now lives in a separate Python service. This is the transport
 * to it.
 *
 * Two properties matter:
 *
 * 1. **Optional.** With `AI_ENGINE_URL` unset, `isConfigured` is false and
 *    `ai_gateway.service.ts` keeps using its own in-process implementation. That
 *    makes adopting the engine, and rolling back from it, a config change rather
 *    than a deploy.
 * 2. **Never throws.** Every method returns `null` on failure, because the whole
 *    feed is built to degrade around a missing AI result. A timeout or an
 *    unreachable engine must leave `/news/generate` answering its usual 502 and
 *    the daily batch reporting `failed: N` — not surface a 500 to a reader.
 *
 * Auth is a short-lived HS256 service token signed with the secret both services
 * share. Tokens are minted on demand and cached until shortly before expiry.
 */

import jwt from "jsonwebtoken";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import type { NewsCategory, NewsScope, VerifiedSource } from "@/types/news.interface";
import type { ArticleTranslation, LanguageCode } from "@/types/i18n.interface";
import type { ExaHit, GeneratedAudio, GeneratedImage } from "@/types/ai.interface";

/** The engine's synthesis result. Deliberately not a finished article. */
export interface EngineSynthesisResult {
  headline: string;
  summary: string;
  content: string;
  verifiedSources: VerifiedSource[];
  godlyPrincipleAlignment: string;
  imagePrompt: string;
  image: GeneratedImage | null;
  meta: {
    runId: string;
    mode: "fast" | "deep";
    sourcesFound: number;
    sourcesCited: number;
    model: string;
    imageGenerated: boolean;
    durationMs: number;
    injectionFlagged: boolean;
  };
}

/** Token is re-minted a minute before expiry so a call never races the boundary. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

class AiEngineClient {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  /** True when the engine is configured and should be used. */
  get isConfigured(): boolean {
    return Boolean(env.aiEngine.url && env.aiEngine.token);
  }

  /**
   * A bearer token for the engine.
   *
   * `AI_ENGINE_TOKEN` may be either a pre-minted token or the shared signing
   * secret. A secret is preferred — tokens are then short-lived and rotate on
   * their own, rather than sitting in the environment until someone notices.
   */
  private getToken(): string {
    const configured = env.aiEngine.token;

    // A JWT has three dot-separated segments; anything else is treated as a secret.
    if (configured.split(".").length === 3) return configured;

    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.cachedToken;
    }

    const ttlSeconds = env.aiEngine.tokenTtlSeconds;
    this.cachedToken = jwt.sign(
      {
        sub: "blacknexa-backend",
        scope: "service",
        role: "service",
      },
      configured,
      {
        algorithm: "HS256",
        issuer: env.aiEngine.issuer,
        audience: env.aiEngine.audience,
        expiresIn: ttlSeconds,
      },
    );
    this.tokenExpiresAt = now + ttlSeconds * 1000;
    return this.cachedToken;
  }

  /**
   * POST to the engine.
   *
   * `timeoutMs` is generous by default: a deep-path synthesis runs a web search,
   * a 7200-token completion and an image generation in one call, so the engine's
   * own 20-second per-call budget can legitimately stack.
   */
  private async post<T>(
    path: string,
    body: unknown,
    timeoutMs = env.aiEngine.timeoutMs,
  ): Promise<T | null> {
    if (!this.isConfigured) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${env.aiEngine.url}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        // 502 from the engine means "no source material" — an expected outcome,
        // not an incident, so it is logged at a lower level.
        const detail = await res.text().catch(() => "<no body>");
        const level = res.status === 502 ? "info" : "warn";
        logger[level]("[ai-engine] non-ok response", {
          path,
          status: res.status,
          detail: detail.slice(0, 300),
        });
        return null;
      }

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      logger.warn("[ai-engine] request failed", {
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** GET from the engine. */
  private async get<T>(path: string, timeoutMs = env.aiEngine.timeoutMs): Promise<T | null> {
    if (!this.isConfigured) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${env.aiEngine.url}${path}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        logger.warn("[ai-engine] non-ok response", { path, status: res.status });
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      logger.warn("[ai-engine] request failed", {
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // ── Operations ─────────────────────────────────────────────────────────────

  /** Grounded web search. Returns `[]` on failure, matching the local behaviour. */
  async searchWeb(
    query: string,
    numResults: number,
    maxCharacters: number,
  ): Promise<ExaHit[] | null> {
    const body = await this.post<{ results: ExaHit[]; total: number }>(
      "/api/v1/internal/news/search",
      { query, numResults, maxCharacters },
    );
    return body ? body.results : null;
  }

  /**
   * Run the grounded pipeline.
   *
   * The engine returns headline/summary/content/sources — Node assembles the
   * `NewsArticle` around it, so article identity and the curated fallback image
   * pools stay here.
   */
  async synthesize(input: {
    topicPrompt: string;
    category: NewsCategory;
    scope: NewsScope;
    mode: "fast" | "deep";
    includeImage?: boolean;
  }): Promise<EngineSynthesisResult | null> {
    return this.post<EngineSynthesisResult>("/api/v1/internal/news/synthesize", input);
  }

  /** Generate a story-matching image. */
  async generateImage(input: {
    headline: string;
    category: NewsCategory;
    scope: NewsScope;
    imagePrompt?: string;
  }): Promise<GeneratedImage | null> {
    const body = await this.post<{ image: GeneratedImage | null }>(
      "/api/v1/internal/news/image",
      { ...input, imagePrompt: input.imagePrompt ?? "" },
    );
    return body?.image ?? null;
  }

  /** Generate a TTS briefing. */
  async generateAudio(input: {
    headline: string;
    summary: string;
    content?: string;
  }): Promise<GeneratedAudio | null> {
    const body = await this.post<{ audio: GeneratedAudio | null }>(
      "/api/v1/internal/news/audio",
      { ...input, content: input.content ?? "" },
    );
    return body?.audio ?? null;
  }

  /** Translate an article's text fields. */
  async translate(input: {
    language: LanguageCode;
    headline: string;
    summary: string;
    content: string;
    godlyPrincipleAlignment: string;
  }): Promise<ArticleTranslation | null> {
    const body = await this.post<{ translation: ArticleTranslation | null }>(
      "/api/v1/internal/news/translate",
      input,
    );
    return body?.translation ?? null;
  }

  /** Liveness probe, for the health endpoint and for boot diagnostics. */
  async health(): Promise<{ status: string; aiGatewayConfigured: boolean } | null> {
    if (!env.aiEngine.url) return null;
    try {
      const res = await fetch(`${env.aiEngine.url}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return null;
      return (await res.json()) as { status: string; aiGatewayConfigured: boolean };
    } catch {
      return null;
    }
  }
}

export const aiEngineClient = new AiEngineClient();
export default aiEngineClient;
