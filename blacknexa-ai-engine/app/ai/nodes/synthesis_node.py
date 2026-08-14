"""Node 2 — briefing synthesis.

Sends the retrieved sources to the synthesis model with the editorial system
prompt and parses the JSON it returns.

The hardening applied to the output fields matters: the model was fed
attacker-influenceable web content, and its answer is about to be persisted and
rendered on a public page, so control and invisible characters are stripped before
anything leaves this node.
"""

from __future__ import annotations

from typing import Any

from app.ai.prompts.news_synthesis import build_user_prompt, system_instruction
from app.ai.state import GenerationState, SynthesisOutput
from app.core.config import settings
from app.core.logging import get_logger
from app.core.prompt_safety import sanitise_model_text
from app.integrations.llm.chat import chat_completion, extract_json_object, message_content

logger = get_logger(__name__)

# Node's hardening in generateCore, preserved: every NewsArticle field must be a
# real string, because JSON.stringify drops undefined and the mobile decoders are
# strict about missing keys.
_SUMMARY_FALLBACK = "Briefing summary pending."
_ALIGNMENT_FALLBACK = "Honest stewardship and factual clarity under God."


async def run(state: GenerationState) -> GenerationState:
    """Populate `state.synthesis`, or fail the run."""
    if state.failed:
        return state

    body = await chat_completion(
        model=settings.synthesis_model,
        system=system_instruction(fast=state.is_fast),
        user=build_user_prompt(
            topic_prompt=state.topic_prompt,
            category=state.category,
            scope=state.scope,
            sources_block=state.sources_block,
        ),
        temperature=state.synthesis_temperature,
        max_tokens=state.synthesis_max_tokens,
    )

    parsed = extract_json_object(message_content(body))
    # Node requires both a headline and a summary before accepting the payload.
    if not parsed or not parsed.get("headline") or not parsed.get("summary"):
        logger.warning("synthesis_unusable", mode=state.mode, has_body=body is not None)
        state.fail("synthesis_failed")
        return state

    headline = sanitise_model_text(str(parsed.get("headline") or ""), max_chars=1000)
    summary = sanitise_model_text(str(parsed.get("summary") or ""))
    content = sanitise_model_text(str(parsed.get("content") or ""))
    alignment = sanitise_model_text(str(parsed.get("godlyPrincipleAlignment") or ""))
    image_prompt = sanitise_model_text(str(parsed.get("imagePrompt") or ""), max_chars=4000)

    state.synthesis = SynthesisOutput(
        # A missing headline falls back to the topic, as in Node.
        headline=headline or state.topic_prompt,
        summary=summary or _SUMMARY_FALLBACK,
        # A missing body falls back to the summary rather than shipping an empty
        # article.
        content=content or summary or _SUMMARY_FALLBACK,
        cited_sources=_clean_cited(parsed.get("verifiedSources")),
        godly_principle_alignment=alignment or _ALIGNMENT_FALLBACK,
        image_prompt=image_prompt,
    )

    logger.info(
        "synthesis_node_complete",
        mode=state.mode,
        content_chars=len(state.synthesis.content),
        cited=len(state.synthesis.cited_sources),
    )
    return state


def _clean_cited(raw: Any) -> list[dict[str, str]]:
    """Normalise the model's `verifiedSources` array.

    Only shape is enforced here. Whether a URL is *real* is decided in the source
    filter node, which intersects against the actual search hits.
    """
    if not isinstance(raw, list):
        return []

    cleaned: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        cleaned.append(
            {
                "name": sanitise_model_text(str(item.get("name") or ""), max_chars=300),
                "url": url,
            }
        )
    return cleaned
