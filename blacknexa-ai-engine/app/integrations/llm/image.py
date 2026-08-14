"""Photojournalistic image generation.

Ports `aiGatewayService.generateArticleImage()`. The model is multimodal, called
through chat-completions with `modalities: ["text", "image"]`.

Gateways disagree about where the image lands, so all three observed shapes are
handled, exactly as the Node implementation does:
  * `message.images[]` as bare data-URI strings,
  * `message.images[]` as `{image_url: {url}}` objects,
  * a data URI embedded in `message.content`.

Returns `None` on any failure — the caller then falls back to a curated photo, so
the feed never shows a broken thumbnail.
"""

from __future__ import annotations

import re
import time
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.gateway import post_json
from app.integrations.llm.chat import CHAT_PATH, first_message
from app.schemas.news import GeneratedImage

logger = get_logger(__name__)

_DATA_URI = re.compile(r"^data:(image/[a-zA-Z0-9+.\-]+);base64,(.+)$", re.DOTALL)
_EMBEDDED_DATA_URI = re.compile(r"data:(image/[a-zA-Z0-9+.\-]+);base64,([A-Za-z0-9+/=]+)")
# Some providers return raw base64 with no data-URI prefix.
_BARE_BASE64 = re.compile(r"^[A-Za-z0-9+/]{100,}={0,2}$")

_IMAGE_TEMPERATURE = 0.7
_IMAGE_MAX_TOKENS = 4096


def _parse_data_uri(value: str) -> GeneratedImage | None:
    """Split a data URI into base64 payload and media type."""
    match = _DATA_URI.match(value)
    if match:
        return GeneratedImage(base64=match.group(2), mediaType=match.group(1))
    if _BARE_BASE64.match(value):
        return GeneratedImage(base64=value, mediaType="image/png")
    return None


def _extract_from_entry(entry: Any) -> GeneratedImage | None:
    """Pull an image out of one `images[]` element, string or object."""
    if isinstance(entry, str):
        return _parse_data_uri(entry)
    if isinstance(entry, dict):
        url = (entry.get("image_url") or {}).get("url") if isinstance(
            entry.get("image_url"), dict
        ) else None
        if isinstance(url, str):
            return _parse_data_uri(url)
    return None


def extract_image(body: dict[str, Any] | None) -> GeneratedImage | None:
    """Find the generated image anywhere in the response."""
    message = first_message(body)
    if not message:
        return None

    for entry in message.get("images") or []:
        image = _extract_from_entry(entry)
        if image:
            return image

    content = message.get("content")
    if isinstance(content, str) and content:
        embedded = _EMBEDDED_DATA_URI.search(content)
        if embedded:
            return GeneratedImage(base64=embedded.group(2), mediaType=embedded.group(1))

    logger.warning(
        "image_not_found_in_response",
        image_entries=len(message.get("images") or []),
        has_content=bool(message.get("content")),
    )
    return None


async def generate_image(prompt: str) -> tuple[GeneratedImage | None, int]:
    """Generate one image. Returns `(image, duration_ms)`."""
    started = time.perf_counter()

    body = await post_json(
        CHAT_PATH,
        {
            "model": settings.image_model,
            "modalities": ["text", "image"],
            "messages": [{"role": "user", "content": prompt}],
            "temperature": _IMAGE_TEMPERATURE,
            "max_tokens": _IMAGE_MAX_TOKENS,
        },
    )

    duration_ms = int((time.perf_counter() - started) * 1000)
    image = extract_image(body)

    logger.info(
        "image_generation_complete",
        generated=image is not None,
        duration_ms=duration_ms,
        media_type=image.mediaType if image else None,
    )
    return image, duration_ms
