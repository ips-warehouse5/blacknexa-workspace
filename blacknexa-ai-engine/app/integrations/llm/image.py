"""Photojournalistic image generation.

Ports `aiGatewayService.generateArticleImage()`. The model is multimodal, so the
image comes back from the same `generateContent` call as text, selected by asking
for `responseModalities: ["TEXT", "IMAGE"]`.

Extraction got considerably simpler than the gateway version it replaces. That
one had to handle three observed response shapes — `images[]` as bare data URIs,
`images[]` as `{image_url: {url}}` objects, and a data URI buried in the message
text — because the gateway normalised nothing. Gemini answers with one shape: an
`inlineData` part carrying base64 and a mime type. The embedded-data-URI scan is
kept as a fallback for a model that describes the image in prose instead of
attaching it; the two `images[]` shapes are gone with the gateway that produced
them.

Returns `None` on any failure — the caller then falls back to a curated photo, so
the feed never shows a broken thumbnail.
"""

from __future__ import annotations

import re
import time

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.llm import gemini
from app.schemas.news import GeneratedImage

logger = get_logger(__name__)

_EMBEDDED_DATA_URI = re.compile(r"data:(image/[a-zA-Z0-9+.\-]+);base64,([A-Za-z0-9+/=]+)")

_IMAGE_TEMPERATURE = 0.7
_LABEL = "gemini_image"


def extract_image(body: dict[str, object] | None) -> GeneratedImage | None:
    """Find the generated image in the response."""
    inline = gemini.inline_data_from(body, mime_prefix="image/", label=_LABEL)
    if inline:
        data, mime_type = inline
        return GeneratedImage(base64=data, mediaType=mime_type)

    # Fallback: some prompts get answered with a described image rather than an
    # attached one, and a data URI occasionally arrives inside the text part.
    text = gemini.text_from(body, label=_LABEL)
    if text:
        embedded = _EMBEDDED_DATA_URI.search(text)
        if embedded:
            return GeneratedImage(base64=embedded.group(2), mediaType=embedded.group(1))

    logger.warning(
        "image_not_found_in_response",
        parts=len(gemini.content_parts(body, label=_LABEL)),
        has_text=bool(text),
    )
    return None


async def generate_image(prompt: str) -> tuple[GeneratedImage | None, int]:
    """Generate one image. Returns `(image, duration_ms)`."""
    started = time.perf_counter()

    body = await gemini.generate_content(
        model=settings.image_model,
        user=prompt,
        generation_config={
            "responseModalities": ["TEXT", "IMAGE"],
            "temperature": _IMAGE_TEMPERATURE,
            # No maxOutputTokens: an image is billed as output tokens, and the
            # gateway-era cap of 4096 is close enough to what one image costs
            # that a cap risks a MAX_TOKENS finish with no image attached.
        },
        label=_LABEL,
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
