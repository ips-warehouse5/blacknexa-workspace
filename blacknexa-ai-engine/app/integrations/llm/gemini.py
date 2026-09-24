"""Gemini `generateContent` client.

The one place in the service that knows the shape of Google's Generative Language
API. Text, imagery and speech all go through `generate_content`; the callers above
differ only in the `generationConfig` they ask for and the part type they read
back.

Why this exists as its own module: the engine previously spoke the gateway's
OpenAI-compatible `chat/completions` dialect, where a "message" carried `content`,
`images[]`, and an audio field. Gemini has one uniform answer to all three — a
candidate whose `content.parts[]` holds text, `inlineData`, or both — so the
extraction helpers belong together rather than duplicated per capability.

Failure contract matches the rest of the service: `None` on anything unusable,
never an exception. Three distinct failures all reduce to `None`, and each is
logged with the reason so they stay tellable apart in production:

  * transport/HTTP failure — handled in `transport.post_json`,
  * a blocked *prompt* (`promptFeedback.blockReason`),
  * a blocked or truncated *candidate* (`finishReason` other than `STOP`).

Content moderation (INCIDENT_MODULE_PLAN.md §6.2) needs four things the news
callers never did, all added as keyword arguments whose defaults reproduce the
old request byte for byte:

  * `extra_parts` — photo thumbnails as `inlineData` parts after the text part;
  * `safety_threshold` — a per-call threshold, because the classifier has to be
    able to read the threats it is labelling (the news threshold stays global);
  * `return_blocked` — a blocked prompt is itself the answer for moderation
    ("blocked", held for a human), so the body comes back with its
    `promptFeedback` instead of collapsing to `None`;
  * `max_attempts` / `log_preview` — passed to the transport: Node owns
    moderation retries, and member content must never reach a log line.

`generate_content_result` is the same call returning a `ProviderResult` — the
HTTP status and failure kind behind a missing body — so moderation can tell a
permanent failure (a 400, an unconfigured key) from an outage (review R20).
`generate_content` wraps it and returns the body alone, as before.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.transport import ProviderResult, post_json_result

logger = get_logger(__name__)

#: Categories Gemini lets a caller tune. `HARM_CATEGORY_CIVIC_INTEGRITY` is
#: deliberately absent: it is not settable on this endpoint.
_SAFETY_CATEGORIES = (
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
)

#: A candidate that stopped for any other reason is not a usable result — most
#: often `MAX_TOKENS` (truncated JSON) or `SAFETY`/`PROHIBITED_CONTENT` (filtered).
_OK_FINISH_REASONS = frozenset({"STOP", "FINISH_REASON_STOP", ""})


def endpoint(model: str, method: str = "generateContent") -> str:
    """Absolute URL for one model call."""
    return f"{settings.gemini_base_url}/models/{model}:{method}"


def _auth_headers() -> dict[str, str]:
    """Gemini auth. The key travels in a header, never in the query string, so it
    cannot end up in an access log or a proxy trace."""
    return {"x-goog-api-key": settings.gemini_api_key}


def safety_settings(threshold: str | None = None) -> list[dict[str, str]]:
    """One threshold applied to every tunable category.

    Defaults to `GEMINI_SAFETY_THRESHOLD`; see config for why that is loosened: at
    Gemini's defaults, straight reporting on police accountability or geopolitics
    is filtered often enough to break the feed. Moderation passes its own
    `MODERATION_SAFETY_THRESHOLD` instead.
    """
    level = threshold or settings.gemini_safety_threshold
    return [{"category": category, "threshold": level} for category in _SAFETY_CATEGORIES]


async def generate_content(
    *,
    model: str,
    user: str,
    system: str | None = None,
    generation_config: dict[str, Any] | None = None,
    label: str,
    timeout_seconds: float | None = None,
    extra_parts: Sequence[dict[str, Any]] | None = None,
    safety_threshold: str | None = None,
    return_blocked: bool = False,
    max_attempts: int | None = None,
    log_preview: bool = True,
) -> dict[str, Any] | None:
    """Call `generateContent` for one single-turn prompt.

    Every call in this engine is single-turn — one user message, an optional
    system instruction — so the signature stays flat rather than exposing a
    message list nobody builds. `extra_parts` (e.g. `inlineData` images) follow
    the text part inside that one user turn.

    With `return_blocked=True` a blocked prompt returns its body, so the caller
    can read `promptFeedback.blockReason`; otherwise it returns `None` as before.
    """
    result = await generate_content_result(
        model=model,
        user=user,
        system=system,
        generation_config=generation_config,
        label=label,
        timeout_seconds=timeout_seconds,
        extra_parts=extra_parts,
        safety_threshold=safety_threshold,
        return_blocked=return_blocked,
        max_attempts=max_attempts,
        log_preview=log_preview,
    )
    return result.body


async def generate_content_result(
    *,
    model: str,
    user: str,
    system: str | None = None,
    generation_config: dict[str, Any] | None = None,
    label: str,
    timeout_seconds: float | None = None,
    extra_parts: Sequence[dict[str, Any]] | None = None,
    safety_threshold: str | None = None,
    return_blocked: bool = False,
    max_attempts: int | None = None,
    log_preview: bool = True,
) -> ProviderResult:
    """`generate_content`, with the reason for a missing body (review R20).

    `failure` is `unconfigured` when no call was made, `blocked` for a blocked
    prompt without `return_blocked`, and otherwise whatever the transport saw.
    """
    if not settings.ai_enabled:
        logger.warning("gemini_not_configured", call=label)
        return ProviderResult(body=None, failure="unconfigured")

    parts: list[dict[str, Any]] = [{"text": user}]
    if extra_parts:
        parts.extend(extra_parts)

    payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": parts}],
        "safetySettings": safety_settings(safety_threshold),
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    if generation_config:
        payload["generationConfig"] = generation_config

    result = await post_json_result(
        endpoint(model),
        payload,
        label=label,
        headers=_auth_headers(),
        timeout_seconds=timeout_seconds,
        max_attempts=max_attempts,
        log_preview=log_preview,
    )

    body = result.body
    if body is None:
        return result

    # A blocked prompt returns 200 with no candidates at all, so this has to be
    # checked before reading them.
    block_reason = (body.get("promptFeedback") or {}).get("blockReason")
    if block_reason:
        logger.warning("gemini_prompt_blocked", call=label, model=model, reason=block_reason)
        if not return_blocked:
            return ProviderResult(body=None, status=result.status, failure="blocked")

    return result


def first_candidate(body: dict[str, Any] | None) -> dict[str, Any] | None:
    """`candidates[0]`, or None."""
    if not body:
        return None
    candidates = body.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None
    first = candidates[0]
    return first if isinstance(first, dict) else None


def content_parts(body: dict[str, Any] | None, *, label: str = "gemini") -> list[dict[str, Any]]:
    """`candidates[0].content.parts[]`, or `[]`.

    Also the single choke point for `finishReason`: a truncated or filtered
    candidate is reported as empty rather than partially consumed, because half a
    JSON object parses to nothing useful and half an image renders as a broken
    thumbnail.
    """
    candidate = first_candidate(body)
    if not candidate:
        return []

    finish_reason = str(candidate.get("finishReason") or "")
    if finish_reason.upper() not in _OK_FINISH_REASONS:
        logger.warning("gemini_unusable_finish_reason", call=label, reason=finish_reason)
        return []

    parts = (candidate.get("content") or {}).get("parts")
    if not isinstance(parts, list):
        return []
    return [part for part in parts if isinstance(part, dict)]


def text_from(body: dict[str, Any] | None, *, label: str = "gemini") -> str:
    """All text parts joined.

    Gemini may split one JSON answer across several text parts, so concatenating
    rather than taking `parts[0]` is what keeps a long briefing parseable.
    """
    chunks = [
        part["text"]
        for part in content_parts(body, label=label)
        if isinstance(part.get("text"), str) and part["text"]
    ]
    return "".join(chunks)


def inline_data_from(
    body: dict[str, Any] | None, *, mime_prefix: str, label: str = "gemini"
) -> tuple[str, str] | None:
    """The first `inlineData` part whose mime type starts with `mime_prefix`.

    Returns `(base64_data, mime_type)`, or `None`. The prefix filter matters on
    the image path: a multimodal response usually carries a text part describing
    what it drew alongside the image itself.
    """
    for part in content_parts(body, label=label):
        inline = part.get("inlineData") or part.get("inline_data")
        if not isinstance(inline, dict):
            continue
        mime_type = str(inline.get("mimeType") or inline.get("mime_type") or "")
        data = inline.get("data")
        if isinstance(data, str) and data and mime_type.startswith(mime_prefix):
            return data, mime_type
    return None
