"""Provider URLs and response builders for the mocked-HTTP tests.

Both providers are now called directly, so the tests mock two distinct hosts
instead of one gateway. That is an improvement worth noting: synthesis, imagery
and TTS used to share a single `chat/completions` route, which forced tests to
express "first call, then second call" as an ordered `side_effect` list. Under
Gemini each model has its own URL, so those tests can mock each capability
independently and stop depending on call order.

The builders here are the *shape of the Gemini wire format*, kept in one place —
if Google changes it, one file changes.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.integrations.llm import gemini

EXA_SEARCH_URL = f"{settings.exa_base_url}/search"

SYNTHESIS_URL = gemini.endpoint(settings.synthesis_model)
TRANSLATION_URL = gemini.endpoint(settings.translation_model)
IMAGE_URL = gemini.endpoint(settings.image_model)
TTS_URL = gemini.endpoint(settings.tts_model)


def gemini_text(text: str, finish_reason: str = "STOP") -> dict[str, Any]:
    """A text response from `generateContent`."""
    return {
        "candidates": [
            {
                "content": {"role": "model", "parts": [{"text": text}]},
                "finishReason": finish_reason,
            }
        ]
    }


def gemini_inline(
    data: str, mime_type: str, *, text: str | None = None, finish_reason: str = "STOP"
) -> dict[str, Any]:
    """A response carrying an `inlineData` part — an image or an audio payload.

    `text` adds a leading text part, which is what the image model actually does:
    it narrates what it drew alongside the image itself.
    """
    parts: list[dict[str, Any]] = []
    if text is not None:
        parts.append({"text": text})
    parts.append({"inlineData": {"mimeType": mime_type, "data": data}})
    return {
        "candidates": [
            {"content": {"role": "model", "parts": parts}, "finishReason": finish_reason}
        ]
    }


def gemini_blocked(reason: str = "SAFETY") -> dict[str, Any]:
    """A blocked prompt: 200 OK, no candidates."""
    return {"promptFeedback": {"blockReason": reason}}


def exa_results(urls: list[str]) -> dict[str, Any]:
    """An Exa search response for the given URLs."""
    return {
        "results": [
            {
                "title": f"Report {i}",
                "url": url,
                "publishedDate": "2026-08-01T00:00:00Z",
                "highlights": [f"Verified excerpt {i}."],
            }
            for i, url in enumerate(urls)
        ]
    }


def sent_user_text(request_content: bytes) -> str:
    """The user prompt out of a captured Gemini request body."""
    import json

    payload = json.loads(request_content)
    return str(payload["contents"][0]["parts"][0]["text"])


def sent_system_text(request_content: bytes) -> str:
    """The system instruction out of a captured Gemini request body."""
    import json

    payload = json.loads(request_content)
    return str(payload["systemInstruction"]["parts"][0]["text"])
