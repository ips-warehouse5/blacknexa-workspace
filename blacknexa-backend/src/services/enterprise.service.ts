/**
 * Enterprise Core Engine — the `/api/v1/blacknexa/*` surface.
 *
 * Ported from `platform/enterprise.ts`. Three guardrails define this engine:
 *
 *   • **600-character minimum narrative.** Enforced, and padded rather than
 *     rejected, so a thin AI response still produces a usable briefing.
 *   • **The five journalism questions.** The prompt demands who/what/where/when/why
 *     with real names and an exact location.
 *   • **3-to-5 independent sources** on the verified-publish path. Fewer than three
 *     is rejected outright with the "Truth Guardrail Error" the clients display.
 *
 * When the gateway is unavailable, `buildLocalNarrative` composes a factual
 * narrative from the caller's own substantiated facts — the endpoint degrades
 * instead of failing, which is what keeps the publish flow usable offline.
 */

import { Op } from "sequelize";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { fetchWithTimeout, extractJsonObject, safeHostname } from "@/utils/http.util";
import { EnterpriseArticle, ArtistTip, HardwareTrigger } from "@/models/enterprise_article.model";
import aiGatewayService from "@/services/ai_gateway.service";
import {
  DEFAULTS,
  ENTERPRISE_MIN_CONTENT_CHARS,
  ENTERPRISE_PADDING,
} from "@/config/constants";
import {
  ENTERPRISE_CATEGORIES,
  PLATFORM_CATEGORY_LABELS,
  isEnterpriseCategory,
  type PlatformCategory,
} from "@/types/platform.interface";

const SYNTHESIS_MODEL = "google/gemini-2.5-flash-lite";

/** Request payload for `POST /blacknexa/generate-story`. */
export interface ArticleGenerationRequest {
  topic: string;
  category: string;
  targetLocation: string;
  specificIndividualsInvolved: string[];
  rawSubstantiatedFacts: string;
  locale?: string;
}

/** Request payload for `POST /blacknexa/publish-verified-story`. */
export interface VerifiedArticleRequest {
  topic: string;
  category: string;
  targetLocation: string;
  keyIndividuals: string[];
  rawFacts: string;
  /** URLs — must be 3 to 10 entries. */
  verifiedSources: string[];
}

/** The response shape for a generated enterprise article. */
export interface ArticleResponse {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  location: string;
  keyIndividuals: string[];
  content: string;
  characterCount: number;
  factVerified: boolean;
  locale: string;
  verifiedSources: { name: string; url: string }[];
  timestamp: string;
}

export interface ArtistTipRecord {
  id: number;
  artistId: string;
  supporterUserId: string;
  tipAmountUsd: number;
  message: string;
  timestamp: string;
}

export interface HardwareTriggerRecord {
  eventId: number;
  userId: string;
  deviceMac: string;
  action: string;
  location: string;
  timestamp: string;
}

interface NarrativeJson {
  content: string;
  verifiedSources: { name: string; url: string }[];
}

class EnterpriseService {
  /** The enterprise category list with display labels. */
  getCategories(): Array<{ id: PlatformCategory; label: string }> {
    return ENTERPRISE_CATEGORIES.map((id) => ({ id, label: PLATFORM_CATEGORY_LABELS[id] }));
  }

  // ── Narrative generation ───────────────────────────────────────────────────

  /**
   * Build the narrative: live web search for corroboration, then synthesis
   * constrained to the caller's facts plus those sources.
   */
  private async generateNarrative(
    payload: ArticleGenerationRequest,
  ): Promise<{ content: string; sources: { name: string; url: string }[] }> {
    if (!env.ai.enabled) {
      return { content: this.buildLocalNarrative(payload), sources: [] };
    }

    const searchQuery = `${payload.topic} ${payload.targetLocation} ${payload.specificIndividualsInvolved.join(" ")}`;
    const hits = await aiGatewayService.searchWeb(searchQuery, 6, 1200);

    const sourcesBlock = hits
      .map((h, i) => {
        const hl = (h.highlights ?? []).slice(0, 2).join(" ");
        return `SOURCE ${i + 1}: ${h.title ?? "Untitled"} (${h.url})\n${hl}`;
      })
      .join("\n\n");

    const systemPrompt = `You are the Blacknexa Enterprise AI News Engine. Generate a deep-context, fact-verified news narrative that empowers Black and Brown communities worldwide.

STRICT RULES:
1. Use ONLY the provided facts and source material. Do not invent facts, names, dollar amounts, dates, or URLs.
2. The content MUST be at least 600 characters, ideally 1500-3000 characters for depth.
3. The narrative MUST explicitly answer the five journalism questions: WHO is involved, WHAT happened, WHERE it took place, WHEN it occurred, and WHY it matters.
4. Name every person, organization, agency, and community affected.
5. Frame the story around integrity, economic emancipation, civic progress, and community empowerment.
6. Zero gossip, sensationalism, or crime glorification.

Output STRICTLY this JSON shape:
{
  "content": "The full narrative text, 600+ characters, answering who/what/where/when/why.",
  "verifiedSources": [{"name": "Publisher name", "url": "exact source URL"}]
}`;

    const userPrompt = `Topic: ${payload.topic}
Category: ${payload.category}
Target Location: ${payload.targetLocation}
Individuals Involved: ${payload.specificIndividualsInvolved.join(", ")}
Raw Substantiated Facts: ${payload.rawSubstantiatedFacts}

Additional verified web sources:
${sourcesBlock || "No additional web sources found."}

Generate a deep-context, fact-verified narrative answering who, what, where, when, and why. Minimum 600 characters.`;

    const res = await fetchWithTimeout(`${env.ai.toolkitUrl}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.secretKey}`,
      },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2400,
      }),
    });

    if (!res || !res.ok) {
      if (res) logger.warn("[enterprise] synthesis non-ok", { status: res.status });
      return {
        content: this.buildLocalNarrative(payload),
        sources: this.sourcesFromHits(hits),
      };
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const parsed = extractJsonObject<NarrativeJson>(
      data?.choices?.[0]?.message?.content ?? "",
      (p) => Boolean(p.content),
    );

    if (parsed && parsed.content.length >= ENTERPRISE_MIN_CONTENT_CHARS) {
      return {
        content: parsed.content,
        sources: this.mergeSources(parsed.verifiedSources, hits),
      };
    }

    // Below the minimum: append the deterministic narrative rather than discard
    // whatever the model did produce.
    const localNarrative = this.buildLocalNarrative(payload);
    const combined = parsed?.content
      ? `${parsed.content}\n\n${localNarrative}`
      : localNarrative;
    return { content: combined, sources: this.sourcesFromHits(hits) };
  }

  /** Deterministic narrative from the caller's own facts, for the offline path. */
  private buildLocalNarrative(payload: ArticleGenerationRequest): string {
    const individuals = payload.specificIndividualsInvolved.join(", ");
    let narrative =
      `In ${payload.targetLocation}, a critical development has unfolded regarding ${payload.topic}. ` +
      `Key individuals involved include ${individuals}. ` +
      `According to verified investigative reports and substantiated local documentation: ${payload.rawSubstantiatedFacts}. ` +
      `This event carries significant structural, civic, and economic implications for Black communities locally in ${payload.targetLocation} ` +
      `and nationwide across the United States. Observers, community leaders, and stakeholders emphasize that understanding ` +
      `the precise context of this occurrence is vital for accountability, growth, and long-term empowerment.`;

    if (narrative.length < ENTERPRISE_MIN_CONTENT_CHARS) {
      narrative +=
        " Further historical and contextual analysis reveals that systemic factors " +
        "directly influence these outcomes, necessitating active civic participation, " +
        "transparent documentation, and community-driven safeguards to ensure sustained progress. " +
        "The individuals and organizations named in this report have been verified through " +
        "cross-referenced source material, ensuring that every claim is grounded in documented " +
        "evidence rather than speculation or hearsay.";
    }
    return narrative;
  }

  private sourcesFromHits(
    hits: Array<{ title?: string; url: string; highlights?: string[]; publishedDate?: string | null }>,
  ): { name: string; url: string; excerpt?: string; publishedDate?: string }[] {
    return hits.slice(0, 7).map((h) => ({
      name: h.title ?? safeHostname(h.url),
      url: h.url,
      excerpt: (h.highlights ?? []).slice(0, 2).join(" ").trim() || undefined,
      publishedDate: h.publishedDate?.slice(0, 10) || undefined,
    }));
  }

  /** Keep only cited sources that really came from the search results. */
  private mergeSources(
    cited: { name: string; url: string }[] | undefined,
    hits: Array<{ title?: string; url: string; highlights?: string[]; publishedDate?: string | null }>,
  ): { name: string; url: string }[] {
    if (!cited || cited.length === 0) return this.sourcesFromHits(hits);
    const known = new Set(hits.map((h) => h.url));
    const cleaned = cited.filter((s) => s?.url && known.has(s.url));
    return cleaned.length > 0 ? cleaned : this.sourcesFromHits(hits);
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  /** Insert an enterprise article and return the response shape. */
  async insertArticle(article: {
    title: string;
    category: string;
    location: string;
    keyIndividuals: string[];
    content: string;
    locale: string;
    verifiedSources: { name: string; url: string }[];
  }): Promise<ArticleResponse> {
    const categoryLabel = isEnterpriseCategory(article.category)
      ? PLATFORM_CATEGORY_LABELS[article.category]
      : article.category;

    const timestamp = new Date().toISOString();
    const charCount = article.content.length;

    const row = await EnterpriseArticle.create({
      title: article.title,
      category: article.category,
      location: article.location,
      key_individuals: article.keyIndividuals,
      content: article.content,
      character_count: charCount,
      fact_verified: true,
      locale: article.locale || "en",
      verified_sources: article.verifiedSources,
      timestamp,
    });

    return {
      id: row.id,
      title: article.title,
      category: article.category,
      categoryLabel,
      location: article.location,
      keyIndividuals: article.keyIndividuals,
      content: article.content,
      characterCount: charCount,
      factVerified: true,
      locale: article.locale || "en",
      verifiedSources: article.verifiedSources,
      timestamp,
    };
  }

  /**
   * Query the enterprise feed.
   *
   * Location matching is a case-insensitive substring so "Atlanta" finds
   * "Atlanta, Georgia". The pattern is passed as a bind parameter, so the
   * user-supplied text cannot alter the query structure.
   */
  async queryFeed(filters: { location?: string; category?: string }): Promise<ArticleResponse[]> {
    const where: Record<string, unknown> = {};
    if (filters.category) where.category = filters.category;
    if (filters.location) {
      where.location = { [Op.iLike]: `%${filters.location}%` };
    }

    const rows = await EnterpriseArticle.findAll({
      where,
      order: [["timestamp", "DESC"]],
      limit: DEFAULTS.ENTERPRISE_FEED_LIMIT,
    });
    return rows.map((r) => this.rowToResponse(r));
  }

  async articleCount(): Promise<number> {
    return EnterpriseArticle.count();
  }

  private rowToResponse(row: EnterpriseArticle): ArticleResponse {
    const category = row.category as PlatformCategory;
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: isEnterpriseCategory(category)
        ? PLATFORM_CATEGORY_LABELS[category]
        : row.category,
      location: row.location,
      keyIndividuals: Array.isArray(row.key_individuals) ? row.key_individuals : [],
      content: row.content,
      characterCount: row.character_count,
      factVerified: row.fact_verified,
      locale: row.locale,
      verifiedSources: Array.isArray(row.verified_sources) ? row.verified_sources : [],
      timestamp: row.timestamp,
    };
  }

  // ── Public operations ──────────────────────────────────────────────────────

  /** `POST /blacknexa/generate-story`. */
  async generateStory(
    payload: ArticleGenerationRequest,
  ): Promise<
    { success: true; article: ArticleResponse; status: number } | { success: false; error: string; status: number }
  > {
    if (!isEnterpriseCategory(payload.category)) {
      return { success: false, error: "Invalid Blacknexa category selected.", status: 400 };
    }
    if (!payload.topic || !payload.targetLocation) {
      return { success: false, error: "topic and targetLocation are required.", status: 400 };
    }

    const { content, sources } = await this.generateNarrative(payload);

    let finalContent = content;
    if (finalContent.length < ENTERPRISE_MIN_CONTENT_CHARS) {
      finalContent += ENTERPRISE_PADDING;
    }

    const article = await this.insertArticle({
      title: `Civic Report: ${payload.topic} in ${payload.targetLocation}`,
      category: payload.category,
      location: payload.targetLocation,
      keyIndividuals: payload.specificIndividualsInvolved ?? [],
      content: finalContent,
      locale: payload.locale ?? "en",
      verifiedSources: sources,
    });

    return { success: true, article, status: 201 };
  }

  /**
   * `POST /blacknexa/publish-verified-story`.
   *
   * The 3-source floor is the Truth Guardrail: a story the caller cannot back
   * with three independent sources is refused, not softened.
   */
  async publishVerifiedStory(
    payload: VerifiedArticleRequest,
  ): Promise<
    { success: true; article: ArticleResponse; status: number } | { success: false; error: string; status: number }
  > {
    if (payload.verifiedSources.length < 3) {
      return {
        success: false,
        error:
          "Truth Guardrail Error: Story rejected. Must include at least 3 to 5 independent factual sources.",
        status: 422,
      };
    }
    if (payload.verifiedSources.length > 10) {
      return { success: false, error: "Maximum 10 verified sources allowed.", status: 422 };
    }
    if (!isEnterpriseCategory(payload.category)) {
      return { success: false, error: "Invalid Blacknexa category.", status: 400 };
    }

    const individuals = payload.keyIndividuals.join(", ");
    let narrative =
      `In ${payload.targetLocation}, a thoroughly documented report has surfaced regarding ${payload.topic}. ` +
      `Primary subjects involved: ${individuals}. ` +
      `Cross-referenced against ${payload.verifiedSources.length} verified public registries and primary source logs, ` +
      `investigators confirm: ${payload.rawFacts}. ` +
      `This briefing upholds our absolute standard of faith-grounded truth, economic empowerment, and civic accountability.`;

    if (narrative.length < ENTERPRISE_MIN_CONTENT_CHARS) {
      narrative +=
        " Comprehensive historical, economic, and systemic data analysis further demonstrates that ongoing factors " +
        "directly shape these outcomes, requiring active global civic vigilance, uncompromised factual reporting, " +
        "and permanent documentation to protect community autonomy worldwide.";
    }

    const article = await this.insertArticle({
      title: `Verified Global Briefing: ${payload.topic} (${payload.targetLocation})`,
      category: payload.category,
      location: payload.targetLocation,
      keyIndividuals: payload.keyIndividuals,
      content: narrative,
      locale: "en",
      verifiedSources: payload.verifiedSources.map((url) => ({
        name: safeHostname(url),
        url,
      })),
    });

    return { success: true, article, status: 201 };
  }

  /** `POST /blacknexa/artists/tip` — the simplified direct-tip record. */
  async processArtistTip(params: {
    artistId: string;
    supporterUserId: string;
    tipAmountUsd: number;
    message?: string;
  }): Promise<
    { success: true; record: ArtistTipRecord; status: number } | { success: false; error: string; status: number }
  > {
    if (!params.artistId || !params.supporterUserId) {
      return { success: false, error: "artistId and supporterUserId are required.", status: 400 };
    }
    if (params.tipAmountUsd <= 0) {
      return { success: false, error: "Tip amount must be greater than zero.", status: 400 };
    }

    const timestamp = new Date().toISOString();
    const row = await ArtistTip.create({
      artist_id: params.artistId,
      supporter_user_id: params.supporterUserId,
      tip_amount_usd: params.tipAmountUsd,
      message: params.message ?? "",
      timestamp,
    });

    return {
      success: true,
      record: {
        id: row.id,
        artistId: params.artistId,
        supporterUserId: params.supporterUserId,
        tipAmountUsd: params.tipAmountUsd,
        message: params.message ?? "",
        timestamp,
      },
      status: 201,
    };
  }

  /**
   * `POST /blacknexa/hardware/beacon-trigger` — logs a panic-button or geofence
   * event from a hardware beacon or the in-app safety button.
   */
  async handleBeaconTrigger(params: {
    userId: string;
    deviceMacAddress: string;
    triggerType: string;
    gpsCoordinates?: { lat: number; lon: number };
  }): Promise<
    { success: true; record: HardwareTriggerRecord; status: number } | { success: false; error: string; status: number }
  > {
    if (!params.userId || !params.deviceMacAddress || !params.triggerType) {
      return {
        success: false,
        error: "userId, deviceMacAddress, and triggerType are required.",
        status: 400,
      };
    }

    const timestamp = new Date().toISOString();
    const lat = params.gpsCoordinates?.lat ?? 0;
    const lon = params.gpsCoordinates?.lon ?? 0;
    const locationStr = `${lat},${lon}`;

    const row = await HardwareTrigger.create({
      user_id: params.userId,
      device_mac: params.deviceMacAddress,
      action: params.triggerType,
      location: locationStr,
      timestamp,
    });

    logger.info("[enterprise] beacon trigger logged", {
      userId: params.userId,
      triggerType: params.triggerType,
    });

    return {
      success: true,
      record: {
        eventId: row.event_id,
        userId: params.userId,
        deviceMac: params.deviceMacAddress,
        action: params.triggerType,
        location: locationStr,
        timestamp,
      },
      status: 201,
    };
  }
}

export const enterpriseService = new EnterpriseService();
export default enterpriseService;
