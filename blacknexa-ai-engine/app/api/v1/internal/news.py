"""Internal news-engine routes.

Service-to-service only — every route requires a valid service token. Nothing here
is ever exposed to a browser or a mobile client; the Node backend remains the only
public surface.

Route-level rate limits are tighter on the generation paths than on the catalogue
reads, because those are the ones that spend money at the gateway.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from app.ai.prompts.daily_prompts import (
    DAILY_BATCH_SIZE,
    day_index_at,
    pick_daily_batch,
)
from app.api.rate_limit import limiter
from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import ServiceCaller
from app.integrations.search.exa import search_web
from app.repositories.run_log import record_operation
from app.schemas.news import (
    AudioRequest,
    AudioResponse,
    DailyPromptsResponse,
    ImageRequest,
    ImageResponse,
    LanguagesResponse,
    SearchRequest,
    SearchResponse,
    SynthesizeRequest,
    SynthesizeResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.services import news_service, translation_service
from app.services.languages import SUPPORTED_LANGUAGES

logger = get_logger(__name__)

router = APIRouter(prefix="/news", tags=["news"])


@router.post("/search", response_model=SearchResponse, summary="Grounded web search")
@limiter.limit(settings.rate_limit_generation)
async def search(
    request: Request,
    response: Response,
    payload: SearchRequest,
    caller: ServiceCaller,
) -> SearchResponse:
    """Replaces `aiGatewayService.searchWeb()`.

    Returns `[]` rather than an error when the upstream has nothing — the caller
    treats an empty result as "no grounding available".
    """
    hits = await search_web(
        payload.query,
        num_results=payload.numResults,
        max_characters=payload.maxCharacters,
    )
    return SearchResponse(results=hits, total=len(hits))


@router.post(
    "/synthesize",
    response_model=SynthesizeResponse,
    summary="Generate a grounded briefing",
)
@limiter.limit(settings.rate_limit_generation)
async def synthesize(
    request: Request,
    response: Response,
    payload: SynthesizeRequest,
    caller: ServiceCaller,
) -> SynthesizeResponse:
    """Replaces `generateGroundedArticleFast()` and `generateGroundedArticle()`.

    Returns the synthesis result, not a finished article — Node assembles the
    `NewsArticle` so identity and the curated fallback pools stay in one place.

    502 when no source material was found; Node maps that to the message the app
    already displays.
    """
    return await news_service.synthesize(payload)


@router.post("/image", response_model=ImageResponse, summary="Generate article imagery")
@limiter.limit(settings.rate_limit_generation)
async def image(
    request: Request,
    response: Response,
    payload: ImageRequest,
    caller: ServiceCaller,
) -> ImageResponse:
    """Replaces `generateArticleImage()`.

    A null `image` is a valid 200: the caller falls back to a curated photo, so the
    feed never renders a broken thumbnail.
    """
    result = await news_service.generate_article_image(payload)
    await record_operation(
        run_id=f"img-{id(payload):x}"[:32],
        operation="image",
        outcome="success" if result.image else "no_image",
        model=result.model,
        duration_ms=result.durationMs,
        caller=caller.sub,
    )
    return result


@router.post("/audio", response_model=AudioResponse, summary="Generate a TTS briefing")
@limiter.limit(settings.rate_limit_generation)
async def audio(
    request: Request,
    response: Response,
    payload: AudioRequest,
    caller: ServiceCaller,
) -> AudioResponse:
    """Replaces `generateArticleAudio()`.

    A null `audio` is a valid 200 — the app falls back to device TTS.
    """
    result = await news_service.generate_article_audio(payload)
    await record_operation(
        run_id=f"aud-{id(payload):x}"[:32],
        operation="audio",
        outcome="success" if result.audio else "no_audio",
        model=result.model,
        duration_ms=result.durationMs,
        caller=caller.sub,
    )
    return result


@router.post("/translate", response_model=TranslateResponse, summary="Translate an article")
@limiter.limit(settings.rate_limit_generation)
async def translate(
    request: Request,
    response: Response,
    payload: TranslateRequest,
    caller: ServiceCaller,
) -> TranslateResponse:
    """Replaces `i18nService.translateArticle()`.

    A null `translation` is a valid 200: Node then serves the English source with
    `background: true`, so a reader is never blocked by a translation failure.
    `lang=en` short-circuits with no model call.
    """
    translation, duration_ms = await translation_service.translate_article(payload)
    await record_operation(
        run_id=f"tr-{id(payload):x}"[:32],
        operation="translate",
        outcome="success" if translation else "failed",
        model=settings.translation_model,
        duration_ms=duration_ms,
        language=payload.language,
        caller=caller.sub,
    )
    return TranslateResponse(
        translation=translation,
        model=settings.translation_model,
        durationMs=duration_ms,
    )


@router.get(
    "/daily-prompts",
    response_model=DailyPromptsResponse,
    summary="Today's deterministic prompt batch",
)
async def daily_prompts(
    caller: ServiceCaller,
    day_index: int | None = Query(
        default=None,
        alias="dayIndex",
        ge=0,
        description="UTC day index. Defaults to today, so the batch is stable all day.",
    ),
    count: int = Query(default=DAILY_BATCH_SIZE, ge=1, le=100),
) -> DailyPromptsResponse:
    """Replaces `pickDailyBatch()` / `dayIndexAt()`.

    Deterministic on the day index, which is what keeps `refresh-daily` idempotent.
    """
    index = day_index if day_index is not None else day_index_at()
    prompts = pick_daily_batch(index, count)
    return DailyPromptsResponse(dayIndex=index, count=len(prompts), prompts=prompts)


@router.get("/languages", response_model=LanguagesResponse, summary="Translation catalogue")
async def languages(caller: ServiceCaller) -> LanguagesResponse:
    """The 19 supported languages, in the order the picker renders them."""
    return LanguagesResponse(languages=SUPPORTED_LANGUAGES, total=len(SUPPORTED_LANGUAGES))
