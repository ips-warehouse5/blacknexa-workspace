"""Text-to-speech audio briefings.

Ports `aiGatewayService.generateArticleAudio()` and `buildSpokenScript()`, now on
Gemini's TTS model instead of the gateway's `xai/grok-tts`.

**The output container changed, and callers must know.** The gateway returned a
finished MP3. Gemini returns raw signed 16-bit little-endian PCM in an
`inlineData` part whose mime type declares the sample rate
(`audio/L16;codec=pcm;rate=24000`). Raw PCM has no header, so nothing can play it
as a file — this module wraps it in a 44-byte RIFF/WAVE header and reports
`audio/wav`. That is done in pure Python precisely so the service needs no audio
codec, no ffmpeg, and no new dependency; MP3 would need all three.

Downstream, `audio/wav` has to be an allowed media type wherever the MP3 was
assumed — the backend's S3 extension map and its media sniffing both needed a
`.wav` entry. `expo-av` on the client plays WAV on iOS, Android and web without
change.

A note on the script builder: it supports appending the first 800 words of the
article body, but `generateAudioForArticle` in Node only ever passes headline and
summary, so in practice every briefing today is a two-sentence teaser and the
excerpt branch is dead. That behaviour is reproduced exactly — `content` defaults
to empty — while the parameter stays available, so the product can lengthen
briefings by passing the body without any engine change.
"""

from __future__ import annotations

import base64
import binascii
import re
import struct
import time

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.llm import gemini
from app.schemas.news import GeneratedAudio

logger = get_logger(__name__)

# Node: `content.trim().split(/\s+/).slice(0, 800).join(" ")`
_SCRIPT_EXCERPT_WORDS = 800

_WHITESPACE = re.compile(r"\s+")
_LABEL = "gemini_tts"

# Gemini's TTS output format, fixed by the model rather than requested: mono,
# signed 16-bit little-endian. Only the rate varies, and it is announced in the
# mime type, so it is parsed rather than assumed.
_PCM_CHANNELS = 1
_PCM_SAMPLE_WIDTH_BYTES = 2
_DEFAULT_SAMPLE_RATE_HZ = 24_000
_RATE_IN_MIME = re.compile(r"rate=(\d+)")

WAV_MEDIA_TYPE = "audio/wav"


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


def sample_rate_from_mime(mime_type: str) -> int:
    """Read `rate=` out of an `audio/L16;codec=pcm;rate=24000` mime type.

    A wrong rate does not fail loudly — it plays the briefing at the wrong pitch —
    so a missing or unparseable rate falls back to the model's documented 24 kHz
    and says so in the log.
    """
    match = _RATE_IN_MIME.search(mime_type or "")
    if match:
        try:
            rate = int(match.group(1))
        except ValueError:
            rate = 0
        if rate > 0:
            return rate

    logger.warning("tts_rate_unparsed", mime_type=mime_type, assumed=_DEFAULT_SAMPLE_RATE_HZ)
    return _DEFAULT_SAMPLE_RATE_HZ


def wrap_pcm_as_wav(pcm: bytes, sample_rate: int) -> bytes:
    """Prepend a canonical 44-byte RIFF/WAVE header to raw PCM."""
    byte_rate = sample_rate * _PCM_CHANNELS * _PCM_SAMPLE_WIDTH_BYTES
    block_align = _PCM_CHANNELS * _PCM_SAMPLE_WIDTH_BYTES

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm),  # chunk size: everything after these first 8 bytes
        b"WAVE",
        b"fmt ",
        16,  # PCM fmt chunk size
        1,  # audio format: 1 = uncompressed PCM
        _PCM_CHANNELS,
        sample_rate,
        byte_rate,
        block_align,
        _PCM_SAMPLE_WIDTH_BYTES * 8,
        b"data",
        len(pcm),
    )
    return header + pcm


def _to_wav_base64(pcm_base64: str, mime_type: str) -> str | None:
    """Re-encode a base64 PCM payload as base64 WAV."""
    try:
        pcm = base64.b64decode(pcm_base64, validate=True)
    except (binascii.Error, ValueError):
        logger.warning("tts_undecodable_payload", payload_chars=len(pcm_base64))
        return None

    if not pcm:
        return None

    wav = wrap_pcm_as_wav(pcm, sample_rate_from_mime(mime_type))
    return base64.b64encode(wav).decode("ascii")


async def generate_audio(
    headline: str, summary: str, content: str = ""
) -> tuple[GeneratedAudio | None, str, int]:
    """Generate a spoken briefing. Returns `(audio, script, duration_ms)`."""
    started = time.perf_counter()
    script = build_spoken_script(headline, summary, content)

    body = await gemini.generate_content(
        model=settings.tts_model,
        user=script,
        generation_config={
            # AUDIO must be the only modality: the TTS models reject a request
            # that also asks for text.
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": settings.tts_voice}}
            },
        },
        label=_LABEL,
    )

    inline = gemini.inline_data_from(body, mime_prefix="audio/", label=_LABEL)
    if inline is None:
        duration_ms = int((time.perf_counter() - started) * 1000)
        logger.warning("tts_no_audio", script_chars=len(script), duration_ms=duration_ms)
        return None, script, duration_ms

    pcm_base64, mime_type = inline
    wav_base64 = _to_wav_base64(pcm_base64, mime_type)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if wav_base64 is None:
        logger.warning("tts_unusable_audio", script_chars=len(script), duration_ms=duration_ms)
        return None, script, duration_ms

    logger.info(
        "tts_complete",
        script_chars=len(script),
        duration_ms=duration_ms,
        source_mime=mime_type,
    )
    return GeneratedAudio(base64=wav_base64, mediaType=WAV_MEDIA_TYPE), script, duration_ms
