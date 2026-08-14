"""Request/response models for the news AI engine.

Field names are **camelCase on the wire** to match what the Node service already
speaks (`NewsArticle`, `VerifiedSource`, `ArticleTranslation`), so the client in
Node needs no key mapping. `populate_by_name` lets Python code use snake_case
internally where that reads better.

`extra="forbid"` on request models is the mass-assignment guard: a caller cannot
smuggle an unexpected field past validation.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

# Mirrors the Node `NewsCategory` union exactly.
NewsCategory = Literal[
    "business-wealth-stewardship",
    "local-national-politics-civic",
    "education-youth-advancement",
    "clean-tech-and-advancements",
    "faith-commandments-morality",
    "hbcu-education",
    "breaking-geopolitical",
    "civil-rights-police-accountability",
]

NewsScope = Literal["local", "national", "global"]

SynthesisMode = Literal["fast", "deep"]

LanguageCode = Literal[
    "en", "es", "fr", "de", "pt", "ru", "zh", "ja", "ko", "ar",
    "hi", "sw", "yo", "am", "it", "nl", "tr", "vi", "id",
]


class _Wire(BaseModel):
    """Base for models crossing the service boundary."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class _Response(BaseModel):
    """Base for responses — permissive on input, camelCase on output."""

    model_config = ConfigDict(populate_by_name=True)


# ── Search ───────────────────────────────────────────────────────────────────


class ExaHit(_Response):
    """One search result. Shape matches the Node `ExaHit` type."""

    title: str | None = None
    url: str
    publishedDate: str | None = None
    author: str | None = None
    highlights: list[str] = Field(default_factory=list)
    score: float | None = None


class SearchRequest(_Wire):
    query: Annotated[str, Field(min_length=2, max_length=1000)]
    numResults: Annotated[int, Field(ge=1, le=25)] = 6
    maxCharacters: Annotated[int, Field(ge=100, le=10_000)] = 1200


class SearchResponse(_Response):
    results: list[ExaHit]
    total: int


# ── Synthesis ────────────────────────────────────────────────────────────────


class VerifiedSource(_Response):
    """A citation. `name`/`url` are required; the rest enrich the source card."""

    name: str
    url: str
    excerpt: str | None = None
    publishedDate: str | None = None


class GeneratedImage(_Response):
    base64: str
    mediaType: str


class SynthesisMeta(_Response):
    """Observability for one run. No article content."""

    runId: str
    mode: SynthesisMode
    sourcesFound: int
    sourcesCited: int
    model: str
    imageGenerated: bool = False
    durationMs: int = 0
    injectionFlagged: bool = False


class SynthesizeRequest(_Wire):
    """Replaces `generateGroundedArticleFast` / `generateGroundedArticle`.

    `topicPrompt` is screened for injection before it reaches the model; the cap
    here is a first bound, and `prompt_safety` applies the configured limit.
    """

    topicPrompt: Annotated[str, Field(min_length=3, max_length=4000)]
    category: NewsCategory = "business-wealth-stewardship"
    scope: NewsScope = "national"
    mode: SynthesisMode = "fast"
    # Deep defaults to True (matching Node, which awaits the image on that path);
    # fast defaults to False and Node generates the image in the background.
    includeImage: bool | None = None

    def wants_image(self) -> bool:
        if self.includeImage is not None:
            return self.includeImage
        return self.mode == "deep"


class SynthesizeResponse(_Response):
    """The synthesis result.

    Deliberately **not** a finished article: no `id`, `slug`, `contentHash`,
    `publishedAt`, `author`, `factCheckStatus` or `imageUrl`. Node assembles those,
    so article identity and the curated fallback-image pools stay in exactly one
    place. See `docs/AI_ENGINE_MIGRATION_PLAN.md` §2.
    """

    headline: str
    summary: str
    content: str
    verifiedSources: list[VerifiedSource]
    godlyPrincipleAlignment: str
    imagePrompt: str = ""
    image: GeneratedImage | None = None
    meta: SynthesisMeta


# ── Image ────────────────────────────────────────────────────────────────────


class ImageRequest(_Wire):
    """Replaces `generateArticleImage()`.

    `imagePrompt` optional: when absent, a prompt is composed from the headline
    and the category context map, exactly as Node does.
    """

    headline: Annotated[str, Field(min_length=1, max_length=1000)]
    category: NewsCategory
    scope: NewsScope
    imagePrompt: Annotated[str, Field(max_length=4000)] = ""


class ImageResponse(_Response):
    image: GeneratedImage | None
    model: str
    durationMs: int = 0


# ── Audio ────────────────────────────────────────────────────────────────────


class AudioRequest(_Wire):
    """Replaces `generateArticleAudio()`.

    `content` is accepted and, when supplied, extends the spoken script to the
    first 800 words of the body. Node currently passes only headline and summary,
    so the default reproduces today's two-sentence briefing exactly.
    """

    headline: Annotated[str, Field(min_length=1, max_length=1000)]
    summary: Annotated[str, Field(max_length=5000)] = ""
    content: Annotated[str, Field(max_length=200_000)] = ""


class GeneratedAudio(_Response):
    base64: str
    mediaType: str


class AudioResponse(_Response):
    audio: GeneratedAudio | None
    model: str
    scriptChars: int = 0
    durationMs: int = 0


# ── Translation ──────────────────────────────────────────────────────────────


class TranslateRequest(_Wire):
    """Replaces `i18nService.translateArticle()`."""

    language: LanguageCode
    headline: Annotated[str, Field(max_length=2000)]
    summary: Annotated[str, Field(max_length=10_000)] = ""
    content: Annotated[str, Field(max_length=200_000)] = ""
    godlyPrincipleAlignment: Annotated[str, Field(max_length=5000)] = ""


class ArticleTranslation(_Response):
    """Matches the Node `ArticleTranslation` type field-for-field."""

    language: str
    headline: str
    summary: str
    content: str
    godlyPrincipleAlignment: str
    translatedAt: str


class TranslateResponse(_Response):
    translation: ArticleTranslation | None
    model: str
    durationMs: int = 0


# ── Daily prompts ────────────────────────────────────────────────────────────


class SeedPrompt(_Response):
    prompt: str
    category: NewsCategory
    scope: NewsScope


class DailyPromptsResponse(_Response):
    dayIndex: int
    count: int
    prompts: list[SeedPrompt]


# ── Languages ────────────────────────────────────────────────────────────────


class SupportedLanguage(_Response):
    code: str
    nativeName: str
    englishName: str
    locale: str
    flag: str
    rtl: bool = False


class LanguagesResponse(_Response):
    languages: list[SupportedLanguage]
    total: int


# ── Health ───────────────────────────────────────────────────────────────────


class HealthResponse(_Response):
    status: str
    service: str
    version: str
    aiGatewayConfigured: bool
    persistenceEnabled: bool
    now: str
