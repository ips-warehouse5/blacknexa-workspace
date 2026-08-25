"""News generation service — the orchestration layer above the AI graph.

Screens input, runs the pipeline, shapes the response, and records a run log.
Deliberately thin: the pipeline logic lives in `app/ai/`, and this is where HTTP
concerns meet it.

The failure mapping is the important part. Node's caller expects specific
outcomes, so:
  * no grounding material  → 502, which Node turns into "No current source
    material was found for that topic. Try a more specific prompt."
  * unusable model output  → 502
  * a provider unconfigured → 503
Anything else raises and is caught by the central handler.

Synthesis needs both providers: Gemini to write and Exa to ground. A missing Exa
key would otherwise surface as "no current source material for that topic" on
every single request — a content message for a configuration fault — so it is
checked up front and reported as unavailable instead.
"""

from __future__ import annotations

from app.ai.graph import run_generation
from app.ai.prompts.imagery import resolve_image_prompt
from app.ai.state import GenerationState
from app.core.config import settings
from app.core.errors import (
    GatewayUnavailableError,
    NoSourceMaterialError,
    SynthesisFailedError,
)
from app.core.logging import get_logger
from app.core.prompt_safety import screen_topic_prompt
from app.integrations.audio.tts import generate_audio
from app.integrations.llm.image import generate_image
from app.repositories.run_log import record_run
from app.schemas.news import (
    AudioRequest,
    AudioResponse,
    ImageRequest,
    ImageResponse,
    SynthesisMeta,
    SynthesizeRequest,
    SynthesizeResponse,
)

logger = get_logger(__name__)


async def synthesize(request: SynthesizeRequest) -> SynthesizeResponse:
    """Run the full grounded-generation pipeline for one topic."""
    if not settings.ai_enabled or not settings.search_enabled:
        raise GatewayUnavailableError()

    # Screened before a single token is spent. Raises PromptRejectedError (400)
    # on instruction-override phrasing or an oversized topic.
    topic = screen_topic_prompt(request.topicPrompt)

    state = GenerationState(
        topic_prompt=topic,
        category=request.category,
        scope=request.scope,
        mode=request.mode,
        want_image=request.wants_image(),
    )

    state = await run_generation(state)

    if state.failure == "no_source_material":
        await record_run(state, outcome="no_source_material")
        raise NoSourceMaterialError()
    if state.failed or state.synthesis is None:
        await record_run(state, outcome=state.failure or "synthesis_failed")
        raise SynthesisFailedError()

    await record_run(state, outcome="success")

    return SynthesizeResponse(
        headline=state.synthesis.headline,
        summary=state.synthesis.summary,
        content=state.synthesis.content,
        verifiedSources=state.verified_sources,
        godlyPrincipleAlignment=state.synthesis.godly_principle_alignment,
        imagePrompt=state.synthesis.image_prompt,
        image=state.image,
        meta=SynthesisMeta(
            runId=state.run_id,
            mode=state.mode,
            sourcesFound=len(state.hits),
            sourcesCited=len(state.verified_sources),
            model=settings.synthesis_model,
            imageGenerated=state.image is not None,
            durationMs=state.elapsed_ms,
            injectionFlagged=state.injection_flagged,
        ),
    )


async def generate_article_image(request: ImageRequest) -> ImageResponse:
    """Generate a story-matching image for an already-published article.

    Node calls this in the background after a fast-path publish. A `None` image is
    a valid response, not an error — the caller falls back to a curated photo.
    """
    if not settings.ai_enabled:
        raise GatewayUnavailableError()

    prompt = resolve_image_prompt(
        image_prompt=request.imagePrompt,
        headline=request.headline,
        category=request.category,
        scope=request.scope,
    )
    image, duration_ms = await generate_image(prompt)

    return ImageResponse(
        image=image,
        model=settings.image_model,
        durationMs=duration_ms,
    )


async def generate_article_audio(request: AudioRequest) -> AudioResponse:
    """Generate a TTS briefing. A `None` audio is valid — the app falls back to
    device TTS, which is exactly what `app/news/[id].tsx` does on a 404."""
    if not settings.ai_enabled:
        raise GatewayUnavailableError()

    audio, script, duration_ms = await generate_audio(
        request.headline, request.summary, request.content
    )

    return AudioResponse(
        audio=audio,
        model=settings.tts_model,
        scriptChars=len(script),
        durationMs=duration_ms,
    )
