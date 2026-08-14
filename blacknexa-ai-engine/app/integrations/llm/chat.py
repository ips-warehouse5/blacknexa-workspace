"""Chat-completions client and defensive JSON extraction.

The gateway does not support `response_format: {"type": "json_object"}` for every
model, so JSON is requested in the prompt and parsed defensively — the model may
wrap it in prose or a code fence. This ports `extractJsonObject` from
`blacknexa-backend/src/utils/http.util.ts`.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.logging import get_logger
from app.integrations.gateway import post_json

logger = get_logger(__name__)

CHAT_PATH = "/v2/vercel/v1/chat/completions"

_FENCED = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


async def chat_completion(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    extra_payload: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Call chat-completions. Returns the raw body, or `None` on failure."""
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if extra_payload:
        payload.update(extra_payload)

    return await post_json(CHAT_PATH, payload)


def first_message(body: dict[str, Any] | None) -> dict[str, Any] | None:
    """`choices[0].message`, or None."""
    if not body:
        return None
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    return message if isinstance(message, dict) else None


def message_content(body: dict[str, Any] | None) -> str:
    """`choices[0].message.content`, or an empty string."""
    message = first_message(body)
    if not message:
        return ""
    content = message.get("content")
    return content if isinstance(content, str) else ""


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
