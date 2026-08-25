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
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.llm import gemini

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
) -> dict[str, Any] | None:
    """Generate text. Returns the raw Gemini body, or `None` on failure."""
    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
        # Off by default — see `GEMINI_THINKING_BUDGET`. Sent explicitly rather
        # than left to the model default so latency does not change under the
        # service when Google shifts that default.
        "thinkingConfig": {"thinkingBudget": settings.gemini_thinking_budget},
    }
    if json_output:
        generation_config["responseMimeType"] = "application/json"

    return await gemini.generate_content(
        model=model,
        system=system,
        user=user,
        generation_config=generation_config,
        label=label,
    )


def message_content(body: dict[str, Any] | None) -> str:
    """The generated text, or an empty string."""
    return gemini.text_from(body, label="gemini_text")


def extract_json_object(text: str) -> dict[str, Any] | None:
    """Pull the first JSON object out of a model response.

    Handles a bare object, one wrapped in a ```json fence, and one surrounded by
    commentary. Ported from the Node `extractJsonObject`: strip the fence if
    present, then take everything between the first `{` and the last `}`.
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
        logger.warning("json_extraction_failed", preview=candidate[:200])
        return None

    return parsed if isinstance(parsed, dict) else None
