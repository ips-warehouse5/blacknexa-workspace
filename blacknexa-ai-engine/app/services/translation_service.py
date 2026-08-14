"""Article translation.

Ports `i18nService.translateArticle()`. Articles are authored in English; when a
reader selects a native language the model translates the headline, summary, body
and the godly-principle alignment. Node caches the result, so a second read in the
same language costs nothing.

Two behaviours are load-bearing and preserved exactly:

* **`en` short-circuits.** English is the source language, so it echoes the input
  back with no model call at all.
* **Failure returns `None`, never an error.** Node's translate route serves the
  English source with `background: true` on a miss, so a reader is never blocked
  by a translation problem. Raising here would break that.

`max_tokens` is 4096 rather than something tighter for a real reason: a fast-path
briefing is 525–975 English words, and CJK or agglutinative translations used to
exceed 1500 tokens and truncate the JSON mid-string.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

from app.ai.prompts.translation import build_user_prompt, system_instruction
from app.core.config import settings
from app.core.logging import get_logger
from app.core.prompt_safety import sanitise_model_text
from app.integrations.llm.chat import chat_completion, extract_json_object, message_content
from app.schemas.news import ArticleTranslation, TranslateRequest
from app.services.languages import get_language

logger = get_logger(__name__)

_TEMPERATURE = 0.15
_MAX_TOKENS = 4096


def _now_iso() -> str:
    """ISO-8601 UTC with a trailing Z, matching JavaScript's `toISOString()`."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def translate_article(
    request: TranslateRequest,
) -> tuple[ArticleTranslation | None, int]:
    """Translate an article's text fields. Returns `(translation, duration_ms)`."""
    started = time.perf_counter()

    # English is the source — echo it back, no model call.
    if request.language == "en":
        return (
            ArticleTranslation(
                language="en",
                headline=request.headline,
                summary=request.summary,
                content=request.content,
                godlyPrincipleAlignment=request.godlyPrincipleAlignment,
                translatedAt=_now_iso(),
            ),
            0,
        )

    language = get_language(request.language)
    if language is None:
        logger.warning("translate_unknown_language", language=request.language)
        return None, 0

    body = await chat_completion(
        model=settings.translation_model,
        system=system_instruction(),
        user=build_user_prompt(
            english_name=language.englishName,
            native_name=language.nativeName,
            locale=language.locale,
            headline=request.headline,
            summary=request.summary,
            content=request.content,
            godly_principle_alignment=request.godlyPrincipleAlignment,
        ),
        temperature=_TEMPERATURE,
        max_tokens=_MAX_TOKENS,
    )

    duration_ms = int((time.perf_counter() - started) * 1000)
    parsed = extract_json_object(message_content(body))

    # Node requires headline, summary and content before accepting a translation —
    # a partial result would render as a half-empty article.
    if not parsed or not all(parsed.get(k) for k in ("headline", "summary", "content")):
        logger.warning(
            "translate_unusable_response",
            language=request.language,
            duration_ms=duration_ms,
        )
        return None, duration_ms

    translation = ArticleTranslation(
        language=request.language,
        headline=sanitise_model_text(str(parsed.get("headline") or "")),
        summary=sanitise_model_text(str(parsed.get("summary") or "")),
        content=sanitise_model_text(str(parsed.get("content") or "")),
        godlyPrincipleAlignment=sanitise_model_text(
            str(parsed.get("godlyPrincipleAlignment") or "")
        ),
        translatedAt=_now_iso(),
    )

    logger.info(
        "translate_complete",
        language=request.language,
        content_chars=len(translation.content),
        duration_ms=duration_ms,
    )
    return translation, duration_ms
