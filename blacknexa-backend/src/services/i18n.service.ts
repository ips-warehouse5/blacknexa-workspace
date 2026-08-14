/**
 * Internationalisation service — the 19-language catalogue and AI translation.
 *
 * Ported from the Worker's `_lib/i18n.ts`. Articles are authored in English;
 * when a reader selects a native language the gateway translates the headline,
 * summary, body and godly-principle alignment. The caller caches the result, so a
 * second read in the same language costs nothing.
 *
 * The catalogue covers the largest global reading populations plus the African
 * and diaspora languages the platform specifically serves (Swahili, Yoruba,
 * Amharic).
 */

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { fetchWithTimeout, extractJsonObject } from "@/utils/http.util";
import aiEngineClient from "@/services/ai_engine.client";
import type {
  ArticleTranslation,
  LanguageCode,
  LegalResourceTranslation,
  SupportedLanguage,
  TranslatedFields,
  TranslatedLegalFields,
} from "@/types/i18n.interface";

/** All languages supported for translation. `en` is the source language. */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: "en", nativeName: "English", englishName: "English", locale: "en-US", flag: "🇺🇸" },
  { code: "es", nativeName: "Español", englishName: "Spanish", locale: "es-ES", flag: "🇪🇸" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese", locale: "pt-BR", flag: "🇧🇷" },
  { code: "fr", nativeName: "Français", englishName: "French", locale: "fr-FR", flag: "🇫🇷" },
  { code: "de", nativeName: "Deutsch", englishName: "German", locale: "de-DE", flag: "🇩🇪" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", locale: "it-IT", flag: "🇮🇹" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch", locale: "nl-NL", flag: "🇳🇱" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", locale: "ru-RU", flag: "🇷🇺" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", locale: "tr-TR", flag: "🇹🇷" },
  {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    locale: "ar-SA",
    rtl: true,
    flag: "🇸🇦",
  },
  {
    code: "zh",
    nativeName: "中文",
    englishName: "Chinese (Simplified)",
    locale: "zh-CN",
    flag: "🇨🇳",
  },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", locale: "ja-JP", flag: "🇯🇵" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", locale: "ko-KR", flag: "🇰🇷" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", locale: "hi-IN", flag: "🇮🇳" },
  {
    code: "vi",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    locale: "vi-VN",
    flag: "🇻🇳",
  },
  {
    code: "id",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    locale: "id-ID",
    flag: "🇮🇩",
  },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili", locale: "sw-KE", flag: "🇰🇪" },
  { code: "yo", nativeName: "Yorùbá", englishName: "Yoruba", locale: "yo-NG", flag: "🇳🇬" },
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic", locale: "am-ET", flag: "🇪🇹" },
];

export const LANGUAGE_BY_CODE: Record<string, SupportedLanguage> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l]),
);

/** Type guard used by the route handlers to reject unsupported `?lang=` values. */
export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return Boolean(code && LANGUAGE_BY_CODE[code]);
}

const TRANSLATE_SYSTEM = `You are the BlackNexa News translation engine. Translate verified, faith-grounded news briefings from English into the reader's native language with the accuracy and register of a professional news desk (Reuters / AP / Xinhua standard).

RULES:
1. Translate every field faithfully — no summarising, no adding, no omitting.
2. Preserve proper nouns (people, organisations, programs, place names) in their widely-accepted local form. Transliterate only when there is an established local spelling.
3. Keep the factual tone, the verified-sources framing, and the godly-principle alignment intact.
4. Do NOT translate URLs, the brand name "BlackNexa", or citation markers.
5. Use the natural, journalistic register of the target language — formal but readable.

Output STRICTLY compact JSON with no markdown, no commentary, and no extra keys:
{"headline":"...","summary":"...","content":"...","godlyPrincipleAlignment":"..."}`;

const LEGAL_TRANSLATE_SYSTEM = `You are the BlackNexa Geo-Legal translation engine. Translate legal resource profiles from English into the reader's native language with the accuracy and register of a legal translation desk.

RULES:
1. Translate the country name, legal framework names, citations, summaries, agency names/descriptions, and press contact names/descriptions faithfully.
2. Preserve statute citations and legal reference numbers in their original form (e.g. "42 U.S.C. § 2000e" stays as-is). Transliterate only when there is an established local spelling.
3. Keep proper nouns (organization names, place names) in their widely-accepted local form.
4. Do NOT translate URLs, the brand name "BlackNexa", or intake email addresses.
5. Use the formal legal register of the target language.

Output STRICTLY compact JSON with no markdown, no commentary, and no extra keys:
{"countryName":"...","legalFrameworks":[{"name":"...","citation":"...","summary":"..."}],"agencies":[{"name":"...","description":"..."}],"pressContacts":[{"name":"...","description":"..."}]}`;

const TRANSLATION_MODEL = "google/gemini-2.5-flash-lite";

class I18nService {
  /** Every non-English language code — the pre-translation target set. */
  get translationTargets(): LanguageCode[] {
    return SUPPORTED_LANGUAGES.filter((l) => l.code !== "en").map((l) => l.code);
  }

  /**
   * Translate an article's text fields. Returns `null` when the gateway failed,
   * so the caller can fall back to English rather than showing an error.
   */
  async translateArticle(input: {
    language: LanguageCode;
    headline: string;
    summary: string;
    content: string;
    godlyPrincipleAlignment: string;
  }): Promise<ArticleTranslation | null> {
    // English is the source — echo it back with no model call.
    if (input.language === "en") {
      return {
        language: "en",
        headline: input.headline,
        summary: input.summary,
        content: input.content,
        godlyPrincipleAlignment: input.godlyPrincipleAlignment,
        translatedAt: new Date().toISOString(),
      };
    }

    const lang = LANGUAGE_BY_CODE[input.language];
    if (!lang) return null;

    // Article translation is part of the news AI engine, so it delegates to Python
    // when configured. `translateLegalResource` below stays local — it belongs to
    // the geo-legal engine, which was not in scope for this migration.
    if (aiEngineClient.isConfigured) {
      const translation = await aiEngineClient.translate({
        language: input.language,
        headline: input.headline,
        summary: input.summary,
        content: input.content,
        godlyPrincipleAlignment: input.godlyPrincipleAlignment,
      });
      if (translation) return translation;
      logger.warn("[i18n] engine translation unavailable — trying the in-process path");
    }

    if (!env.ai.enabled) return null;

    const userPrompt = `Target language: ${lang.englishName} (${lang.nativeName}) — BCP-47 ${lang.locale}.

Translate the following verified BlackNexa briefing into ${lang.englishName}. Preserve all facts, figures, proper nouns, and paragraph structure.

HEADLINE:
${input.headline}

SUMMARY:
${input.summary}

CONTENT:
${input.content}

GODLY PRINCIPLE ALIGNMENT:
${input.godlyPrincipleAlignment}`;

    const res = await fetchWithTimeout(`${env.ai.toolkitUrl}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.secretKey}`,
      },
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.15,
        // A full fast-path briefing is 525–975 English words; CJK and
        // agglutinative translations can exceed 1500 tokens and used to truncate
        // the JSON mid-string. 4096 leaves comfortable headroom.
        max_tokens: 4096,
      }),
    });
    if (!res) return null;
    if (!res.ok) {
      logger.warn("[i18n] translation gateway non-ok", { status: res.status });
      return null;
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const content = data?.choices?.[0]?.message?.content ?? "";
    const fields = extractJsonObject<TranslatedFields>(
      content,
      (p) => Boolean(p.headline && p.summary && p.content),
    );
    if (!fields) return null;

    return {
      language: input.language,
      headline: fields.headline,
      summary: fields.summary,
      content: fields.content,
      godlyPrincipleAlignment: fields.godlyPrincipleAlignment,
      translatedAt: new Date().toISOString(),
    };
  }

  /**
   * Translate a jurisdiction profile for the Geo-Legal engine. Statute citations
   * and URLs are preserved verbatim by the prompt — a mistranslated citation
   * would be worse than an untranslated one.
   */
  async translateLegalResource(input: {
    language: LanguageCode;
    countryName: string;
    legalFrameworks: Array<{ name: string; citation: string; summary: string }>;
    agencies: Array<{ name: string; description: string }>;
    pressContacts: Array<{ name: string; description: string }>;
  }): Promise<LegalResourceTranslation | null> {
    if (input.language === "en") {
      return {
        country: "en",
        countryName: input.countryName,
        legalFrameworks: input.legalFrameworks.map((f) => ({
          name: f.name,
          citation: f.citation,
          summary: f.summary,
        })),
        agencies: input.agencies.map((a) => ({ name: a.name, description: a.description })),
        pressContacts: input.pressContacts.map((p) => ({
          name: p.name,
          description: p.description,
        })),
        translatedAt: new Date().toISOString(),
      };
    }

    if (!env.ai.enabled) return null;
    const lang = LANGUAGE_BY_CODE[input.language];
    if (!lang) return null;

    const userPrompt = `Target language: ${lang.englishName} (${lang.nativeName}) — BCP-47 ${lang.locale}.

Translate the following jurisdiction profile into ${lang.englishName}. Preserve statute citations and URLs as-is.

COUNTRY:
${input.countryName}

LEGAL FRAMEWORKS:
${JSON.stringify(input.legalFrameworks, null, 2)}

AGENCIES:
${JSON.stringify(input.agencies, null, 2)}

PRESS CONTACTS:
${JSON.stringify(input.pressContacts, null, 2)}`;

    const res = await fetchWithTimeout(`${env.ai.toolkitUrl}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.secretKey}`,
      },
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        messages: [
          { role: "system", content: LEGAL_TRANSLATE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.15,
        max_tokens: 2000,
      }),
    });
    if (!res) return null;
    if (!res.ok) {
      logger.warn("[i18n] legal translation gateway non-ok", { status: res.status });
      return null;
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const content = data?.choices?.[0]?.message?.content ?? "";
    const fields = extractJsonObject<TranslatedLegalFields>(
      content,
      (p) => Boolean(p.countryName && Array.isArray(p.legalFrameworks)),
    );
    if (!fields) return null;

    return {
      country: input.language,
      countryName: fields.countryName,
      legalFrameworks: fields.legalFrameworks,
      agencies: fields.agencies,
      pressContacts: fields.pressContacts,
      translatedAt: new Date().toISOString(),
    };
  }
}

export const i18nService = new I18nService();
export default i18nService;
