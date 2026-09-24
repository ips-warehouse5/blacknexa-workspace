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
 *
 * ── Moderation needs more than `null` (docs/INCIDENT_MODULE_PLAN.md §5.3) ────
 * The news methods collapse every failure to `null`, which is right for them:
 * the feed degrades the same way whatever went wrong. The moderation worker
 * cannot. A timeout, a 429 or a 5xx means "try again with backoff"; a 401 or a
 * 422 means "retrying will not help — hold it for a human"; an unconfigured
 * engine means "skip the AI stage". So `assessModeration()` goes through
 * `postWithStatus()`, which returns a discriminated result carrying the HTTP
 * status and an error *type* — never a response body, because a moderation
 * request is member content and its error echo must not reach the logs (§6.1).
 * The news methods are unchanged.
 */

import jwt from "jsonwebtoken";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { parseAiAssessment, type EngineAssessment } from "@/services/moderation_policy";
import type { NewsCategory, NewsScope, VerifiedSource } from "@/types/news.interface";
import type { ArticleTranslation, LanguageCode } from "@/types/i18n.interface";
import type { ExaHit, GeneratedAudio, GeneratedImage } from "@/types/ai.interface";
import type { AiAssessRequest } from "@/types/moderation.interface";

/** Why a status-aware engine call failed. A type, never a message or a body. */
export type EngineErrorType =
  /** `AI_ENGINE_URL` / `AI_ENGINE_TOKEN` not set: the AI stage is skipped. */
  | "unconfigured"
  | "timeout"
  /** The caller aborted (worker shutdown). */
  | "aborted"
  | "network"
  | "rate_limited"
  | "server_error"
  | "auth_error"
  | "client_error"
  /** A 2xx whose body was not the contract's shape. */
  | "invalid_response";

/**
 * The outcome of a status-aware call. `retryable` is the whole point: the
 * moderation worker backs off and retries on `true`, and holds for a human on
 * `false` (§5.3 step 4).
 */
export type EngineCallResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; retryable: boolean; status: number | null; errorType: EngineErrorType };

/**
 * `assessModeration()`'s result. A 200 whose `status` is `unavailable` is still
 * `ok`; its `data.retryable` (review R20) says whether the engine expects a
 * retry to help — the transport-level `retryable` above only covers failures
 * that never produced a body.
 */
export type AssessModerationResult = EngineCallResult<EngineAssessment>;

/** The engine's moderation endpoint (§6.1). */
const MODERATION_ASSESS_PATH = "/api/v1/internal/moderation/assess";

/** Readiness probe timeout — the reconciler's health check, not a request path. */
const READY_TIMEOUT_MS = 5_000;

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

  /**
   * POST to the engine and say exactly how it went.
   *
   * Used by moderation (§5.3 step 4). Classification:
   *   • network error, timeout, 408, 429, 5xx, unusable 2xx body → retryable
   *   • 401 / 403 → `auth_error`, other 4xx → `client_error`: permanent
   *   • caller abort → `aborted` (retryable; the worker releases the run)
   *
   * `parse` turns the JSON into `T` or `null` (→ `invalid_response`). Nothing
   * about the request or the response body is logged — only the path, the
   * status and the error type — because the body is member content.
   */
  private async postWithStatus<T>(
    path: string,
    body: unknown,
    options: {
      timeoutMs: number;
      signal?: AbortSignal;
      parse: (raw: unknown) => T | null;
    },
  ): Promise<EngineCallResult<T>> {
    if (!this.isConfigured) {
      return { ok: false, retryable: false, status: null, errorType: "unconfigured" };
    }
    if (options.signal?.aborted) {
      return { ok: false, retryable: true, status: null, errorType: "aborted" };
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const fail = (
      retryable: boolean,
      status: number | null,
      errorType: EngineErrorType,
    ): EngineCallResult<T> => {
      const level = retryable ? "warn" : "error";
      logger[level]("[ai-engine] call failed", { path, status, errorType });
      return { ok: false, retryable, status, errorType };
    };

    try {
      let res: Response;
      try {
        res = await fetch(`${env.aiEngine.url}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.getToken()}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        if (timedOut) return fail(true, null, "timeout");
        if (options.signal?.aborted) return { ok: false, retryable: true, status: null, errorType: "aborted" };
        return fail(true, null, "network");
      }

      if (!res.ok) {
        // Drain without reading into a log: a 422 body describes the input.
        await res.arrayBuffer().catch(() => undefined);
        if (res.status === 408) return fail(true, res.status, "timeout");
        if (res.status === 429) return fail(true, res.status, "rate_limited");
        if (res.status >= 500) return fail(true, res.status, "server_error");
        if (res.status === 401 || res.status === 403) return fail(false, res.status, "auth_error");
        return fail(false, res.status, "client_error");
      }

      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        if (timedOut) return fail(true, res.status, "timeout");
        if (options.signal?.aborted) return { ok: false, retryable: true, status: res.status, errorType: "aborted" };
        return fail(true, res.status, "invalid_response");
      }
      const data = options.parse(raw);
      if (data === null) return fail(true, res.status, "invalid_response");
      return { ok: true, status: res.status, data };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
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

  /**
   * Assess one report or comment for publication (§5.3 step 4, §6.1).
   *
   * One attempt, `MODERATION_AI_TIMEOUT_MS`: the worker owns retries and
   * backoff, so a slow engine costs one lease-bounded wait per attempt rather
   * than a hidden retry loop. `signal` lets the worker abort in-flight calls on
   * shutdown. The response is validated and normalised by the pure
   * `parseAiAssessment`; a body that fails it is a retryable
   * `invalid_response`. A 200 with `status: "unavailable"` is returned as `ok`
   * with the engine's `retryable` / `unavailableReason` (review R20): the
   * pipeline retries a retryable one and records a non-retryable one as a
   * permanent `error`. An engine that predates the fields reads as retryable.
   */
  async assessModeration(
    input: AiAssessRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<AssessModerationResult> {
    return this.postWithStatus<EngineAssessment>(MODERATION_ASSESS_PATH, input, {
      timeoutMs: env.moderation.aiTimeoutMs,
      signal: options.signal,
      parse: parseAiAssessment,
    });
  }

  /**
   * Whether the engine can moderate right now — `GET /ready` → `moderationReady`
   * (Gemini configured and, in production, permitted by the declared data
   * terms). The reconciler asks before re-running holds an AI outage left
   * behind (§5.2), so a still-broken engine does not turn every held report
   * into another round of failed attempts. Unauthenticated, like `/health`.
   */
  async moderationReady(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      const res = await fetch(`${env.aiEngine.url}/ready`, {
        signal: AbortSignal.timeout(READY_TIMEOUT_MS),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { moderationReady?: unknown };
      return body.moderationReady === true;
    } catch {
      return false;
    }
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
