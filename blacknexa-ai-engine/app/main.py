"""Application entrypoint.

Boot order mirrors the Node service, for the same reason: a misconfigured
deployment should fail before it can accept traffic and look healthy.

  1. Validate configuration — happens on import of `core.config`, which exits the
     process with a readable list on a bad or missing value.
  2. Configure structured logging.
  3. Open the database pool, if persistence is enabled.
  4. Serve.

Shutdown releases the HTTP pool and the database pool in reverse.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.rate_limit import limiter
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger, set_request_id
from app.db.session import dispose_engine, init_engine, is_enabled
from app.integrations.gateway import close_client
from app.schemas.news import HealthResponse

configure_logging()
logger = get_logger(__name__)

VERSION = "1.0.0"
SERVICE_NAME = "blacknexa-ai-engine"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "startup",
        service=SERVICE_NAME,
        version=VERSION,
        environment=settings.environment,
        ai_gateway="configured" if settings.ai_enabled else "not configured",
        persistence="enabled" if settings.persistence_enabled else "disabled",
    )

    if not settings.ai_enabled:
        # Same warning the Node service prints: the process is healthy, but every
        # AI path will return a null result until a key is supplied.
        logger.warning(
            "ai_gateway_unconfigured",
            detail=(
                "AI_TOOLKIT_SECRET_KEY is not set. Synthesis returns 503, image and "
                "audio return null, and translation falls back to English."
            ),
        )

    init_engine()
    try:
        yield
    finally:
        await close_client()
        await dispose_engine()
        logger.info("shutdown_complete")


app = FastAPI(
    title="BlackNexa AI News Engine",
    description=(
        "Grounded article synthesis, photojournalistic imagery, TTS briefings and "
        "translation for the BlackNexa news platform. Internal service — the Node "
        "backend remains the only public API."
    ),
    version=VERSION,
    lifespan=lifespan,
    # No interactive docs in production: the schema names every internal route.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

# ── Middleware ───────────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(_request: Request, exc: RateLimitExceeded) -> Response:
    from fastapi.responses import JSONResponse

    logger.warning("rate_limited", limit=str(exc.detail))
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down and try again shortly."},
    )


# Empty by default. This service is called server-to-server, so no browser origin
# is legitimate; the allowlist exists only for a trusted internal console.
if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Assign a request id, log the outcome, and add baseline security headers."""
    request_id = uuid.uuid4().hex[:8]
    set_request_id(request_id)
    started = datetime.now(UTC)

    try:
        response = await call_next(request)
    finally:
        set_request_id(None)

    duration_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
    response.headers["X-Request-Id"] = request_id
    # This service returns JSON only and is never framed or embedded.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"

    log = logger.error if response.status_code >= 500 else (
        logger.warning if response.status_code >= 400 else logger.info
    )
    log(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
        caller=getattr(request.state, "caller", None),
    )
    return response


register_exception_handlers(app)
app.include_router(api_router)

# ── Health probes (unauthenticated by design) ────────────────────────────────


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health() -> HealthResponse:
    """Liveness. Reports configuration state without touching the gateway."""
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=VERSION,
        aiGatewayConfigured=settings.ai_enabled,
        persistenceEnabled=is_enabled(),
        now=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    )


@app.get("/ready", tags=["health"])
async def ready() -> dict[str, object]:
    """Readiness — distinguishes "process is up" from "can actually serve".

    Not ready without a gateway key: the engine would accept requests and fail
    every one of them, which is worse than being taken out of rotation.
    """
    return {
        "ready": settings.ai_enabled,
        "aiGatewayConfigured": settings.ai_enabled,
        "persistenceEnabled": is_enabled(),
    }


def run() -> None:  # pragma: no cover - process entrypoint
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=not settings.is_production,
        log_config=None,
    )


if __name__ == "__main__":  # pragma: no cover
    run()
