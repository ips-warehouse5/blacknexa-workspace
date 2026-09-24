"""Text-generation client and defensive JSON extraction.

Both text callers — synthesis and translation — want one JSON object back, so
this asks Gemini for `application/json` directly. That is a real upgrade over the
gateway path this replaces: the old OpenAI-compatible endpoint did not honour
`response_format` for every model, so JSON was requested in the prose of the
prompt and hoped for.

`extract_json_object` is kept anyway, and still ports `extractJsonObject` from
`blacknexa-backend/src/utils/http.util.ts`. Two reasons it is not dead code: a
JSON-mode response can still be truncated mid-object, and `AI_SYNTHESIS_MODEL` is
operator-configurable, so a model that ignores the mime type must not take the
feed down.

The public surface here (`chat_completion`, `message_content`,
`extract_json_object`) is unchanged from the gateway implementation, so the
synthesis node and the translation service are untouched by the provider swap.

Content moderation (INCIDENT_MODULE_PLAN.md §6.2) adds keyword arguments, each
defaulting to today's behaviour so the news callers send the identical request:
`response_schema` (Gemini's enum-constrained structured output, so the verdict's
shape is enforced by the provider and not only checked afterwards),
`safety_threshold`, `timeout_seconds`, `extra_parts` (photo parts),
`return_blocked`, `max_attempts`, and `log_preview`. The last one also exists on
`extract_json_object`: a moderation verdict quotes member content, so an
unparseable one is logged by length, never by preview.

`chat_completion_result` returns the transport's `ProviderResult` instead of the
bare body, so the moderation classifier can report *why* it got nothing — a
permanent 4xx versus a timeout or 5xx (review R20). `chat_completion` wraps it.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.llm import gemini
from app.integrations.transport import ProviderResult

logger = get_logger(__name__)

_FENCED = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


async def chat_completion(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    json_output: bool = True,
    label: str = "gemini_text",
    response_schema: dict[str, Any] | None = None,
    safety_threshold: str | None = None,
    timeout_seconds: float | None = None,
    extra_parts: Sequence[dict[str, Any]] | None = None,
    return_blocked: bool = False,
    max_attempts: int | None = None,
    log_preview: bool = True,
) -> dict[str, Any] | None:
    """Generate text. Returns the raw Gemini body, or `None` on failure.

    `response_schema` implies JSON output: Gemini only honours a schema together
    with `responseMimeType: application/json`.
    """
    result = await chat_completion_result(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        max_tokens=max_tokens,
        json_output=json_output,
        label=label,
        response_schema=response_schema,
        safety_threshold=safety_threshold,
        timeout_seconds=timeout_seconds,
        extra_parts=extra_parts,
        return_blocked=return_blocked,
        max_attempts=max_attempts,
        log_preview=log_preview,
    )
    return result.body


async def chat_completion_result(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    json_output: bool = True,
    label: str = "gemini_text",
    response_schema: dict[str, Any] | None = None,
    safety_threshold: str | None = None,
    timeout_seconds: float | None = None,
    extra_parts: Sequence[dict[str, Any]] | None = None,
    return_blocked: bool = False,
    max_attempts: int | None = None,
    log_preview: bool = True,
) -> ProviderResult:
    """`chat_completion`, keeping the status and failure kind (review R20)."""
    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if settings.gemini_thinking_budget > 0:
        generation_config["thinkingConfig"] = {"thinkingBudget": settings.gemini_thinking_budget}
    if json_output or response_schema is not None:
        generation_config["responseMimeType"] = "application/json"
    if response_schema is not None:
        generation_config["responseSchema"] = response_schema

    return await gemini.generate_content_result(
        model=model,
        system=system,
        user=user,
        generation_config=generation_config,
        label=label,
        timeout_seconds=timeout_seconds,
        extra_parts=extra_parts,
        safety_threshold=safety_threshold,
        return_blocked=return_blocked,
        max_attempts=max_attempts,
        log_preview=log_preview,
    )


def message_content(body: dict[str, Any] | None) -> str:
    """The generated text, or an empty string."""
    return gemini.text_from(body, label="gemini_text")


def extract_json_object(text: str, *, log_preview: bool = True) -> dict[str, Any] | None:
    """Pull the first JSON object out of a model response.

    Handles a bare object, one wrapped in a ```json fence, and one surrounded by
    commentary. Ported from the Node `extractJsonObject`: strip the fence if
    present, then take everything between the first `{` and the last `}`.

    `log_preview=False` logs a parse failure by length only.
    """
    if not text:
        return None

    fenced = _FENCED.search(text)
    candidate = fenced.group(1) if fenced else text

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        parsed = json.loads(candidate[start : end + 1])
    except (ValueError, TypeError):
        if log_preview:
            logger.warning("json_extraction_failed", preview=candidate[:200])
        else:
            logger.warning("json_extraction_failed", chars=len(candidate))
        return None

    return parsed if isinstance(parsed, dict) else None
