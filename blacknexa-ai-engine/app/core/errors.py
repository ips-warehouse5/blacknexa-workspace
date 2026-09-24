"""Exception types and the central error handler.

The rule, same as the Node service: **internal detail never reaches the caller in
production.** Gateway response bodies, tracebacks, SQL and driver messages are
logged here and replaced with a generic message in the response.

Expected, caller-caused failures (validation, auth, no-grounding-material) keep
their specific message, because that is information the caller needs to act on —
and Node maps some of them onto user-facing copy.

Validation errors never carry the request back out (INCIDENT_MODULE_PLAN.md §6.1).
Pydantic attaches the offending value to every error as `input` (and sometimes a
wrapped copy in `ctx`), so a report body one character over the cap, or a photo
that fails to decode, would otherwise be echoed into the 422 body and written to
the log verbatim. Both keys are stripped from every validation error, on every
route, before the error is logged or returned; `type`, `loc` and `msg` are enough
for the caller to fix the request.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class EngineError(Exception):
    """Base for errors this service raises deliberately."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail: str = "An unexpected error occurred."

    def __init__(self, detail: str | None = None) -> None:
        if detail:
            self.detail = detail
        super().__init__(self.detail)


class NoSourceMaterialError(EngineError):
    """Web search returned nothing usable for the topic.

    502, matching the Worker: the upstream had no material, which is not a fault
    in the request. Node turns this into "No current source material was found for
    that topic. Try a more specific prompt."
    """

    status_code = status.HTTP_502_BAD_GATEWAY
    detail = "No current source material was found for that topic."


class SynthesisFailedError(EngineError):
    """The model returned nothing parseable after retries."""

    status_code = status.HTTP_502_BAD_GATEWAY
    detail = "The synthesis model did not return a usable briefing."


class GatewayUnavailableError(EngineError):
    """An upstream AI provider is unconfigured or unreachable.

    Name kept: it is what the Node client's error mapping matches on.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    detail = "An AI provider is not configured or is unreachable."


class PromptRejectedError(EngineError):
    """Input was refused by the prompt-injection screen."""

    status_code = status.HTTP_400_BAD_REQUEST
    detail = "The supplied prompt was rejected by the safety screen."


class AuthError(EngineError):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Authentication is required."


class ForbiddenError(EngineError):
    status_code = status.HTTP_403_FORBIDDEN
    detail = "You do not have permission to perform this action."


def _error_body(detail: str, **extra: Any) -> dict[str, Any]:
    """Uniform error envelope. `detail` matches FastAPI's own convention."""
    return {"detail": detail, **extra}


#: Keys of a Pydantic error that hold (a copy of) the caller's input.
_INPUT_BEARING_KEYS = frozenset({"input", "ctx"})


def _without_input(errors: Sequence[Any]) -> list[dict[str, Any]]:
    """Validation errors with every input-bearing key removed."""
    return [
        {key: value for key, value in error.items() if key not in _INPUT_BEARING_KEYS}
        for error in errors
        if isinstance(error, dict)
    ]


def register_exception_handlers(app: FastAPI) -> None:
    """Install handlers. Order matters: most specific first."""

    @app.exception_handler(EngineError)
    async def _engine_error(_request: Request, exc: EngineError) -> JSONResponse:
        # Deliberate errors carry a caller-safe message by construction.
        logger.warning(
            "engine_error",
            error_type=type(exc).__name__,
            status_code=exc.status_code,
            detail=exc.detail,
        )
        return JSONResponse(status_code=exc.status_code, content=_error_body(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Field-level detail is useful — the caller is our own service — but the
        # values themselves are member content on the moderation route, so only
        # the shape of each error survives, in the log and in the response alike.
        errors = _without_input(exc.errors())
        logger.warning("request_validation_failed", errors=errors)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=_error_body("Request validation failed.", errors=jsonable_encoder(errors)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Everything internal goes to the log, never to the response.
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            error_type=type(exc).__name__,
            error=str(exc),
            exc_info=True,
        )
        detail = (
            "An unexpected error occurred."
            if settings.is_production
            else f"{type(exc).__name__}: {exc}"
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body(detail),
        )
