/**
 * Shared i18n catalog for the BlackNexa News app.
 *
 * Mirrors the backend `functions/_lib/i18n.ts` language list so the mobile
 * pickers and the Worker speak the same language codes. The backend is the
 * source of truth for which languages are translatable; this file mirrors it
 * for the client UI.
 */

export type LanguageCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ru"
  | "zh"
  | "ja"
  | "ko"
  | "ar"
  | "hi"
  | "sw"
  | "yo"
  | "am"
  | "it"
  | "nl"
  | "tr"
  | "vi"
  | "id";

export type SupportedLanguage = {
  code: LanguageCode;
  /** Endonym — the language's own name for itself, shown in the picker. */
  nativeName: string;
  /** English label for accessibility / fallback. */
  englishName: string;
  /** BCP-47 locale code used for system date formatting on the client. */
  locale: string;
  /** RTL languages. */
  rtl?: boolean;
  /** A short flag emoji for the picker chip. */
  flag: string;
};

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
  { code: "ar", nativeName: "العربية", englishName: "Arabic", locale: "ar-SA", rtl: true, flag: "🇸🇦" },
  { code: "zh", nativeName: "中文", englishName: "Chinese (Simplified)", locale: "zh-CN", flag: "🇨🇳" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", locale: "ja-JP", flag: "🇯🇵" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", locale: "ko-KR", flag: "🇰🇷" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", locale: "hi-IN", flag: "🇮🇳" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", locale: "vi-VN", flag: "🇻🇳" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", locale: "id-ID", flag: "🇮🇩" },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili", locale: "sw-KE", flag: "🇰🇪" },
  { code: "yo", nativeName: "Yorùbá", englishName: "Yoruba", locale: "yo-NG", flag: "🇳🇬" },
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic", locale: "am-ET", flag: "🇪🇹" },
];

export const LANGUAGE_BY_CODE: Record<LanguageCode, SupportedLanguage> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l]),
) as Record<LanguageCode, SupportedLanguage>;

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return Boolean(code && code in LANGUAGE_BY_CODE);
}

/** A translated view of an article. The image and sources stay as-is. */
export type ArticleTranslation = {
  language: LanguageCode;
  headline: string;
  summary: string;
  content: string;
  godlyPrincipleAlignment: string;
  /** ISO timestamp of when the translation was generated/cached. */
  translatedAt: string;
};
