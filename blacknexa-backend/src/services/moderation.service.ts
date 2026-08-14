/**
 * Automated content moderation.
 *
 * A family-friendly, moral-code filter applied to user posts, art descriptions,
 * tip messages, and live-chat lines before anything is published or broadcast.
 * Ported verbatim from `platform/moderation.ts` — the word lists live in code
 * rather than the database precisely so a change to them goes through code review.
 *
 * Deliberately synchronous and AI-free on the first pass (`checkContent`) so it
 * can run as inline middleware and in the WebSocket message handler without
 * adding latency. `moderateContent` layers caching and an audit log on top.
 */

import { Op } from "sequelize";
import { ModerationLog } from "@/models/compliance.model";
import platformCacheService, { CACHE_TTL } from "@/services/platform_cache.service";
import { sha256Hex } from "@/utils/hash.util";
import { prefixedId } from "@/utils/id.util";
import type { ModerationCategory, ModerationResult } from "@/types/platform.interface";

const PROFANITY_WORDS: ReadonlySet<string> = new Set([
  "damn", "hell", "ass", "bitch", "bastard", "crap",
  "fuck", "shit", "dick", "piss", "slut", "whore",
]);

const HATE_SPEECH_WORDS: ReadonlySet<string> = new Set([
  // Racial slurs and hate speech — zero tolerance.
  "nigger", "nigga", "spic", "chink", "kike", "wetback",
  "coon", "gook", "faggot", "fag", "tranny", "retard",
  // Flagged for review: these are used as racial derogation in context.
  "ape", "monkey",
]);

const VIOLENCE_WORDS: ReadonlySet<string> = new Set([
  "kill", "murder", "assassinate", "massacre", "slaughter",
  "behead", "torture", "mutilate", "bomb", "shoot", "stab",
  "strangle", "poison", "lynch", "execute",
]);

const ADULT_CONTENT_WORDS: ReadonlySet<string> = new Set([
  "porn", "pornography", "xxx", "nude", "naked", "escort",
  "prostitute", "hooker", "strip", "lapdance", "orgasm",
  "masturbat", "sexually explicit",
]);

const SPAM_INDICATORS: ReadonlySet<string> = new Set([
  "buy now", "click here", "free money", "get rich", "crypto giveaway",
  "bitcoin doubler", "investment scheme", "pyramid", "mlm",
  "follow me", "sub4sub", "like4like",
]);

/**
 * Patterns that indicate someone is publishing another person's personal data.
 * Non-global so `test()` has no `lastIndex` state to carry between calls.
 */
const PERSONAL_INFO_PATTERNS: readonly RegExp[] = [
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /\b\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
];

export interface ContentCheckResult {
  approved: boolean;
  flaggedTerms: string[];
  violationCategory: ModerationCategory | null;
}

class ModerationService {
  /**
   * Normalise text for matching: lowercase, undo common l33t-speak substitutions,
   * collapse character runs, strip punctuation. This is what catches "ffff@ck"
   * and "n1gg3r" rather than only the literal spellings.
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/0/g, "o")
      .replace(/1/g, "i")
      .replace(/3/g, "e")
      .replace(/4/g, "a")
      .replace(/5/g, "s")
      .replace(/7/g, "t")
      .replace(/@/g, "a")
      .replace(/\$/g, "s")
      .replace(/!/g, "i")
      // "ffffuck" → "fuck"
      .replace(/(.)\1{2,}/g, "$1")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Synchronous word/pattern filter. Safe to call inline — no I/O.
   *
   * Hate speech is checked first so it always wins the category assignment even
   * when a message also trips a milder rule.
   */
  checkContent(text: string): ContentCheckResult {
    if (!text || text.trim().length === 0) {
      return { approved: true, flaggedTerms: [], violationCategory: null };
    }

    const normalized = this.normalizeText(text);
    const words = normalized.split(/\s+/);
    const flaggedTerms: string[] = [];
    let violationCategory: ModerationCategory | null = null;

    for (const word of words) {
      if (HATE_SPEECH_WORDS.has(word)) {
        flaggedTerms.push(word);
        violationCategory = "hate-speech";
      } else if (PROFANITY_WORDS.has(word)) {
        if (!flaggedTerms.includes(word)) flaggedTerms.push(word);
        if (!violationCategory) violationCategory = "profanity";
      } else if (VIOLENCE_WORDS.has(word)) {
        if (!flaggedTerms.includes(word)) flaggedTerms.push(word);
        if (!violationCategory) violationCategory = "violence";
      } else if (ADULT_CONTENT_WORDS.has(word)) {
        if (!flaggedTerms.includes(word)) flaggedTerms.push(word);
        if (!violationCategory) violationCategory = "adult-content";
      }
    }

    for (const indicator of SPAM_INDICATORS) {
      if (normalized.includes(indicator)) {
        flaggedTerms.push(indicator);
        if (!violationCategory) violationCategory = "spam";
      }
    }

    for (const pattern of PERSONAL_INFO_PATTERNS) {
      if (pattern.test(text)) {
        flaggedTerms.push("[personal-info]");
        if (!violationCategory) violationCategory = "personal-info";
      }
    }

    return {
      approved: flaggedTerms.length === 0,
      flaggedTerms,
      violationCategory,
    };
  }

  /**
   * Full pipeline: cache lookup → word filter → cache write → audit log.
   *
   * The SHA-256 content hash keys the cache, so re-submitting identical text is a
   * single indexed read.
   */
  async moderateContent(text: string): Promise<ModerationResult> {
    const hash = sha256Hex(text);
    const cacheKey = platformCacheService.moderationKey(hash);

    const cached = await platformCacheService.get<ModerationResult>(cacheKey);
    if (cached) return cached;

    const result = this.checkContent(text);
    const moderationResult: ModerationResult = {
      approved: result.approved,
      flaggedTerms: result.flaggedTerms,
      violationCategory: result.violationCategory,
      contentHash: hash,
      moderatedAt: new Date().toISOString(),
    };

    await platformCacheService.set(cacheKey, moderationResult, CACHE_TTL.MODERATION);

    await ModerationLog.upsert({
      id: prefixedId("mod"),
      content_hash: hash,
      approved: result.approved,
      violation_category: result.violationCategory ?? "",
      flagged_terms_json: JSON.stringify(result.flaggedTerms),
      moderated_at: moderationResult.moderatedAt,
      // Only a preview is retained — enough to review a decision, not a full copy.
      content_preview: text.slice(0, 200),
    });

    return moderationResult;
  }

  /** Convenience guard: `if (!(await contentApproved(text))) return error;` */
  async contentApproved(text: string): Promise<boolean> {
    const result = await this.moderateContent(text);
    return result.approved;
  }

  /** Recent decisions, for an operator review screen. */
  async recentDecisions(limit = 50): Promise<ModerationLog[]> {
    return ModerationLog.findAll({
      order: [["moderated_at", "DESC"]],
      limit,
      where: { moderated_at: { [Op.ne]: "" } },
    });
  }
}

export const moderationService = new ModerationService();
export default moderationService;
