"""Provider URLs and response builders for the mocked-HTTP tests.

Both providers are now called directly, so the tests mock two distinct hosts
instead of one gateway. That is an improvement worth noting: synthesis, imagery
and TTS used to share a single `chat/completions` route, which forced tests to
express "first call, then second call" as an ordered `side_effect` list. Under
Gemini each model has its own URL, so those tests can mock each capability
independently and stop depending on call order.

The builders here are the *shape of the Gemini wire format*, kept in one place —
if Google changes it, one file changes.

The moderation builders (INCIDENT_MODULE_PLAN.md §6) produce a valid §6.1 request
and the verdict JSON the model returns inside a Gemini text part, so a test states
only what differs from a clean, fully-assessed answer.
"""

from __future__ import annotations

import base64
import json
from typing import Any

from app.core.config import settings
from app.integrations.llm import gemini
from app.schemas.moderation import POLICY_CATEGORIES

EXA_SEARCH_URL = f"{settings.exa_base_url}/search"

SYNTHESIS_URL = gemini.endpoint(settings.synthesis_model)
TRANSLATION_URL = gemini.endpoint(settings.translation_model)
IMAGE_URL = gemini.endpoint(settings.image_model)
TTS_URL = gemini.endpoint(settings.tts_model)
MODERATION_URL = gemini.endpoint(settings.moderation_model)

#: A fixed Node run id (32 hex, dashes stripped).
MODERATION_RUN_ID = "0123456789abcdef0123456789abcdef"


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


def sent_payload(request_content: bytes) -> dict[str, Any]:
    """A captured Gemini request body, decoded."""
    payload: dict[str, Any] = json.loads(request_content)
    return payload


# ── Moderation ───────────────────────────────────────────────────────────────


def moderation_request(**overrides: Any) -> dict[str, Any]:
    """A valid `/moderation/assess` wire body: a short, clean policing report."""
    body: dict[str, Any] = {
        "runId": MODERATION_RUN_ID,
        "targetType": "report",
        "category": "policing",
        "title": "Stopped outside the library",
        "body": "Two officers stopped me outside the library and searched my bag without a reason.",
        "locationLabel": "Central Library, Main Street",
        "parentTitle": None,
        "urgent": False,
        "flaggedCategories": [],
        "keywordSignals": [],
        "images": [],
    }
    body.update(overrides)
    return body


#: A JPEG start-of-image marker and some filler — enough to be "an image" to the
#: validator, which checks encoding and size, not pixels.
THUMBNAIL_BYTES = bytes.fromhex("ffd8ffe0") + b" thumbnail bytes"


def moderation_image(
    payload: bytes = THUMBNAIL_BYTES, mime_type: str = "image/jpeg"
) -> dict[str, str]:
    """One `images[]` entry."""
    return {"mimeType": mime_type, "data": base64.b64encode(payload).decode("ascii")}


def moderation_output(
    *,
    violations: dict[str, tuple[str, float, str]] | None = None,
    recommendation: str | None = None,
    confidence: float = 0.95,
    safety_risk: str = "none",
    summary: str = "A first-hand account of a police stop and search.",
    language: str = "en",
    english: dict[str, str] | None = None,
) -> dict[str, Any]:
    """The verdict JSON the model returns.

    `violations` maps a code to `(evidence, confidence, severity)`; every other
    code is clear. `recommendation` defaults to what the policy requires.
    """
    violations = violations or {}
    english = english or {}
    categories = []
    for code in POLICY_CATEGORIES:
        if code in violations:
            evidence, score, severity = violations[code]
            categories.append(
                {
                    "code": code,
                    "violation": True,
                    "confidence": score,
                    "severity": severity,
                    "evidence": evidence,
                    "evidenceEnglish": english.get(code),
                }
            )
        else:
            categories.append(
                {
                    "code": code,
                    "violation": False,
                    "confidence": 0.9,
                    "severity": "low",
                    "evidence": "",
                    "evidenceEnglish": None,
                }
            )
    return {
        "categories": categories,
        "safetyRisk": safety_risk,
        "recommendation": recommendation or ("review" if violations else "approve"),
        "confidence": confidence,
        "summary": summary,
        "language": language,
    }


def gemini_moderation(output: dict[str, Any], finish_reason: str = "STOP") -> dict[str, Any]:
    """A `generateContent` response carrying a moderation verdict."""
    return gemini_text(json.dumps(output), finish_reason=finish_reason)
