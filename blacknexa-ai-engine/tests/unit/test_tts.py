"""TTS: the PCM-to-WAV container work introduced by the move to Gemini.

The gateway returned a finished MP3. Gemini returns raw headerless PCM, so the
engine now builds the container itself — and a container bug is exactly the kind
that passes every type check and then plays as silence, static, or the wrong
pitch on a real device. Hence byte-level assertions.
"""

from __future__ import annotations

import base64
import struct

import httpx
import pytest
import respx

from app.integrations.audio.tts import (
    WAV_MEDIA_TYPE,
    build_spoken_script,
    generate_audio,
    sample_rate_from_mime,
    wrap_pcm_as_wav,
)
from app.integrations.transport import close_client
from tests.support import TTS_URL, gemini_inline

GEMINI_PCM_MIME = "audio/L16;codec=pcm;rate=24000"


@pytest.fixture(autouse=True)
async def _reset_client():  # type: ignore[no-untyped-def]
    await close_client()
    yield
    await close_client()


# ── The WAV container ────────────────────────────────────────────────────────


def test_wav_header_is_a_valid_riff_container() -> None:
    pcm = b"\x01\x02" * 1000
    wav = wrap_pcm_as_wav(pcm, 24_000)

    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    assert wav[12:16] == b"fmt "
    assert wav[36:40] == b"data"
    assert len(wav) == 44 + len(pcm)
    assert wav[44:] == pcm, "the audio must not be altered, only framed"


def test_wav_header_fields_describe_gemini_output() -> None:
    """Mono, 16-bit, and the rate the mime type announced. A wrong channel count
    or bit depth is what makes a briefing play as static."""
    pcm = b"\x00\x00" * 512
    wav = wrap_pcm_as_wav(pcm, 24_000)

    (
        _riff,
        chunk_size,
        _wave,
        _fmt,
        fmt_size,
        audio_format,
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        _data,
        data_size,
    ) = struct.unpack("<4sI4s4sIHHIIHH4sI", wav[:44])

    assert chunk_size == 36 + len(pcm)
    assert fmt_size == 16
    assert audio_format == 1, "1 = uncompressed PCM"
    assert channels == 1
    assert sample_rate == 24_000
    assert bits_per_sample == 16
    assert block_align == 2
    assert byte_rate == 24_000 * 2
    assert data_size == len(pcm)


def test_declared_sample_rate_is_honoured() -> None:
    """The rate is read from the mime type, not assumed — a mismatch would play
    the whole briefing at the wrong pitch."""
    assert sample_rate_from_mime("audio/L16;codec=pcm;rate=16000") == 16_000
    assert sample_rate_from_mime(GEMINI_PCM_MIME) == 24_000
    # Unparseable falls back to the model's documented rate rather than failing.
    assert sample_rate_from_mime("audio/L16") == 24_000
    assert sample_rate_from_mime("") == 24_000

    wav = wrap_pcm_as_wav(b"\x00\x00" * 8, sample_rate_from_mime("audio/L16;rate=16000"))
    assert struct.unpack("<I", wav[24:28])[0] == 16_000


# ── The generate_audio contract ──────────────────────────────────────────────


@respx.mock
async def test_generated_audio_is_playable_wav() -> None:
    pcm = b"\x11\x22" * 400
    respx.post(TTS_URL).mock(
        return_value=httpx.Response(
            200,
            json=gemini_inline(base64.b64encode(pcm).decode(), GEMINI_PCM_MIME),
        )
    )

    audio, script, _duration = await generate_audio("Headline", "Summary.")

    assert audio is not None
    # The container, not the codec, is what changed for callers.
    assert audio.mediaType == WAV_MEDIA_TYPE == "audio/wav"
    decoded = base64.b64decode(audio.base64)
    assert decoded[:4] == b"RIFF"
    assert decoded[44:] == pcm
    assert script == "Headline. Summary."


@respx.mock
async def test_tts_asks_for_audio_only_and_the_configured_voice() -> None:
    """The TTS models reject a request that also asks for text."""
    import json

    from app.core.config import settings

    route = respx.post(TTS_URL).mock(
        return_value=httpx.Response(
            200, json=gemini_inline(base64.b64encode(b"\x00\x00" * 8).decode(), GEMINI_PCM_MIME)
        )
    )

    await generate_audio("H", "S")

    config = json.loads(route.calls.last.request.content)["generationConfig"]
    assert config["responseModalities"] == ["AUDIO"]
    voice = config["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"]
    assert voice == settings.tts_voice


@respx.mock
async def test_missing_audio_part_returns_none_not_an_error() -> None:
    """A null briefing is survivable — the app falls back to device TTS."""
    respx.post(TTS_URL).mock(
        return_value=httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "sorry"}]}}]}
        )
    )

    audio, script, _duration = await generate_audio("H", "S")

    assert audio is None
    assert script == "H. S"


@respx.mock
async def test_undecodable_payload_returns_none() -> None:
    """A corrupt payload must not be handed on as a half-written WAV."""
    respx.post(TTS_URL).mock(
        return_value=httpx.Response(200, json=gemini_inline("not!valid!base64", GEMINI_PCM_MIME))
    )

    audio, _script, _duration = await generate_audio("H", "S")

    assert audio is None


@respx.mock
async def test_provider_failure_returns_none() -> None:
    respx.post(TTS_URL).mock(return_value=httpx.Response(500, json={"error": "upstream"}))

    audio, _script, _duration = await generate_audio("H", "S")

    assert audio is None


# ── The ported script builder (unchanged by the migration) ───────────────────


def test_spoken_script_is_unchanged_by_the_provider_swap() -> None:
    assert build_spoken_script("Headline", "Summary.") == "Headline. Summary."
    assert (
        build_spoken_script("Headline", "Summary.", "  Body   copy. ")
        == "Headline. Summary.. Body copy."
    )
