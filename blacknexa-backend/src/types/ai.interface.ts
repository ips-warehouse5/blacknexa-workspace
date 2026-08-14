/**
 * AI gateway types — Exa web search, Gemini synthesis, image generation, TTS.
 * Ported from the Worker's `_lib/generate.ts`.
 */

import type { NewsArticle, NewsCategory, NewsScope } from "@/types/news.interface";

/** One Exa search result. */
export interface ExaHit {
  title?: string;
  url: string;
  publishedDate?: string | null;
  author?: string | null;
  highlights?: string[];
  score?: number;
}

export interface ExaResponse {
  results?: ExaHit[];
  costDollars?: { total?: number };
}

/** Input to the grounded-generation pipeline. */
export interface GenerateInput {
  topicPrompt: string;
  category: NewsCategory;
  scope: NewsScope;
}

/** The JSON contract the synthesis model is asked to return. */
export interface SynthesisedArticle {
  headline: string;
  summary: string;
  content: string;
  verifiedSources: { name: string; url: string }[];
  godlyPrincipleAlignment: string;
  imagePrompt: string;
}

export interface GeneratedImage {
  /** Raw base64-encoded image bytes (no data URI prefix). */
  base64: string;
  /** MIME type, e.g. "image/png". */
  mediaType: string;
}

export interface GeneratedAudio {
  /** Raw base64-encoded audio bytes (no data URI prefix). */
  base64: string;
  /** MIME type, e.g. "audio/mpeg". */
  mediaType: string;
}

/** Depth path result — the unique AI image is already generated and attached. */
export type GeneratedArticle = NewsArticle & {
  imageBase64?: string;
  imageMediaType?: string;
};

/** Fast path result — a curated fallback image now, unique AI image later. */
export type FastGeneratedArticle = NewsArticle & {
  /** True when the AI image is still being generated in the background. */
  imagePending: boolean;
};

/** Shape of a chat-completions response from the gateway. */
export interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string;
      images?: Array<string | { type?: string; image_url?: { url?: string } }>;
    };
  }[];
}
