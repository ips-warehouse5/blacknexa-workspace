/**
 * Internationalisation types — the 19-language catalogue and translation shapes.
 * Ported from the Worker's `_lib/i18n.ts`.
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

export interface SupportedLanguage {
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
}

/** A translated view of an article. The image and sources stay as-is. */
export interface ArticleTranslation {
  language: LanguageCode;
  headline: string;
  summary: string;
  content: string;
  godlyPrincipleAlignment: string;
  /** ISO timestamp of when the translation was generated/cached. */
  translatedAt: string;
}

/** The four fields the translation model returns. */
export interface TranslatedFields {
  headline: string;
  summary: string;
  content: string;
  godlyPrincipleAlignment: string;
}

/** A translated view of a jurisdiction profile for the Geo-Legal engine. */
export interface LegalResourceTranslation {
  country: LanguageCode;
  countryName: string;
  legalFrameworks: Array<{ name: string; citation: string; summary: string }>;
  agencies: Array<{ name: string; description: string }>;
  pressContacts: Array<{ name: string; description: string }>;
  translatedAt: string;
}

export interface TranslatedLegalFields {
  countryName: string;
  legalFrameworks: Array<{ name: string; citation: string; summary: string }>;
  agencies: Array<{ name: string; description: string }>;
  pressContacts: Array<{ name: string; description: string }>;
}
