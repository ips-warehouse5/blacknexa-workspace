"""Exa web search — stage 1 of the grounded pipeline.

Ports `aiGatewayService.searchWeb()`. This is what makes the engine "grounded":
the hits it returns become the *only* sources the article may cite, and everything
downstream intersects against them.

Results are untrusted by construction — `title` and `highlights` are lifted from
live web pages — so each hit is neutralised through `prompt_safety` before it can
reach a prompt, and its URL is validated before it can be published as a source.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.core.prompt_safety import (
    is_safe_source_url,
    neutralise_untrusted_text,
    sanitise_model_text,
)
from app.integrations.gateway import post_json
from app.schemas.news import ExaHit

logger = get_logger(__name__)

_SEARCH_PATH = "/v2/exa/search"

# Titles are one line; anything longer is padding or a payload.
_MAX_TITLE_CHARS = 300


async def search_web(
    query: str,
    num_results: int = 6,
    max_characters: int = 1200,
) -> list[ExaHit]:
    """Search the live web for current, sourceable material.

    Returns `[]` on any failure, matching the Node contract — a search miss means
    "no grounding available", which the caller turns into a 502, not a crash.
    """
    payload: dict[str, Any] = {
        "query": query,
        "type": "auto",
        "numResults": num_results,
        "contents": {
            "highlights": True,
            "text": {"maxCharacters": max_characters},
        },
    }

    data = await post_json(_SEARCH_PATH, payload)
    if data is None:
        return []

    raw_results = data.get("results") or []
    if not isinstance(raw_results, list):
        logger.warning("exa_unexpected_shape", type=type(raw_results).__name__)
        return []

    hits: list[ExaHit] = []
    flagged = 0

    for raw in raw_results:
        if not isinstance(raw, dict):
            continue

        url = str(raw.get("url") or "").strip()
        # A source that cannot be safely published is not usable as grounding
        # either — dropping it here keeps it out of both the prompt and the feed.
        if not is_safe_source_url(url):
            logger.warning("exa_unsafe_url_dropped", url=url[:120])
            continue

        title_result = neutralise_untrusted_text(str(raw.get("title") or ""))
        highlights: list[str] = []
        for item in raw.get("highlights") or []:
            screened = neutralise_untrusted_text(str(item))
            if screened.suspicious:
                flagged += 1
            if screened.text:
                highlights.append(screened.text)

        if title_result.suspicious:
            flagged += 1

        hits.append(
            ExaHit(
                title=sanitise_model_text(title_result.text, max_chars=_MAX_TITLE_CHARS) or None,
                url=url,
                publishedDate=_clean_date(raw.get("publishedDate")),
                author=sanitise_model_text(str(raw.get("author") or ""), max_chars=200) or None,
                highlights=highlights,
                score=_clean_score(raw.get("score")),
            )
        )

    if flagged:
        # Worth surfacing: it means someone is putting directives on pages that
        # rank for topics this platform covers.
        logger.warning(
            "exa_injection_neutralised",
            flagged_fields=flagged,
            query_preview=query[:100],
        )

    logger.info(
        "exa_search_complete",
        requested=num_results,
        returned=len(raw_results),
        usable=len(hits),
    )
    return hits


def _clean_date(value: Any) -> str | None:
    if not value or not isinstance(value, str):
        return None
    return value.strip() or None


def _clean_score(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def source_excerpt(hit: ExaHit) -> str:
    """The first two highlights joined — the excerpt shown on a source card.

    Matches Node's `(h.highlights ?? []).slice(0, 2).join(" ").trim()`.
    """
    return " ".join((hit.highlights or [])[:2]).strip()


def build_sources_block(hits: list[ExaHit]) -> str:
    """Render hits into the `SOURCE n` block the synthesis prompt expects.

    Layout is identical to the Node implementation, so the model sees the same
    structure it was tuned against. Content has already been neutralised.
    """
    blocks: list[str] = []
    for index, hit in enumerate(hits, start=1):
        date = (
            f" (published {hit.publishedDate[:10]})"
            if hit.publishedDate
            else ""
        )
        excerpt = source_excerpt(hit)[: settings.max_source_excerpt_chars]
        blocks.append(
            f"SOURCE {index}{date}\n"
            f"title: {hit.title or 'Untitled'}\n"
            f"url: {hit.url}\n"
            f"excerpt: {excerpt}"
        )
    return "\n\n".join(blocks)
