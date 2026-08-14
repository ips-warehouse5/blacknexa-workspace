"""Text-to-speech audio briefings.

Ports `aiGatewayService.generateArticleAudio()` and `buildSpokenScript()`.

A note on the script builder: it supports appending the first 800 words of the
article body, but `generateAudioForArticle` in Node only ever passes headline and
summary, so in practice every briefing today is a two-sentence teaser and the
excerpt branch is dead. That behaviour is reproduced exactly — `content` defaults
to empty — while the parameter stays available, so the product can lengthen
briefings by passing the body without any engine change.
"""

from __future__ import annotations

import re
import time

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.gateway import post_json
from app.schemas.news import GeneratedAudio

logger = get_logger(__name__)

SPEECH_PATH = "/v2/vercel/v4/ai/speech-model"

# Node: `content.trim().split(/\s+/).slice(0, 800).join(" ")`
_SCRIPT_EXCERPT_WORDS = 800

_WHITESPACE = re.compile(r"\s+")


def build_spoken_script(headline: str, summary: str, content: str = "") -> str:
    """Compose the narration script.

    Ported verbatim: headline and summary always, plus the first 800 words of the
    body when one is supplied, with whitespace collapsed.
    """
    lead = f"{headline}. {summary}"
    if content and content.strip():
        excerpt = " ".join(content.strip().split()[:_SCRIPT_EXCERPT_WORDS])
        return _WHITESPACE.sub(" ", f"{lead}. {excerpt}").strip()
    return _WHITESPACE.sub(" ", lead).strip()


async def generate_audio(
    headline: str, summary: str, content: str = ""
) -> tuple[GeneratedAudio | None, str, int]:
    """Generate an MP3 briefing. Returns `(audio, script, duration_ms)`."""
    started = time.perf_counter()
    script = build_spoken_script(headline, summary, content)

    body = await post_json(
        SPEECH_PATH,
        {
            "text": script,
            "voice": settings.tts_voice,
            "outputFormat": "mp3",
        },
        # The gateway routes TTS by header rather than by a body field.
        extra_headers={
            "ai-model-id": settings.tts_model,
            "ai-gateway-protocol-version": "0.0.1",
        },
    )

    duration_ms = int((time.perf_counter() - started) * 1000)

    audio_b64 = body.get("audio") if isinstance(body, dict) else None
    if not isinstance(audio_b64, str) or not audio_b64:
        logger.warning("tts_no_audio", script_chars=len(script), duration_ms=duration_ms)
        return None, script, duration_ms

    logger.info("tts_complete", script_chars=len(script), duration_ms=duration_ms)
    return GeneratedAudio(base64=audio_b64, mediaType="audio/mpeg"), script, duration_ms
