"""Structured logging.

This is the only place internal detail — provider response bodies, tracebacks,
prompts — is allowed to land. The HTTP error handler logs here and returns a
sanitised message to the caller, matching the Node service's discipline.

`bind_run_id` puts a correlation id on every log line emitted while a generation
run is in flight, so one article's whole pipeline can be pulled out of the log.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

import structlog

from app.core.config import settings

_run_id: ContextVar[str | None] = ContextVar("run_id", default=None)
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def _add_correlation_ids(
    _logger: Any, _method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Attach the current run/request ids to every event."""
    run_id = _run_id.get()
    request_id = _request_id.get()
    if run_id:
        event_dict["run_id"] = run_id
    if request_id:
        event_dict["request_id"] = request_id
    return event_dict


def configure_logging() -> None:
    """Install the structlog pipeline. Call once, at startup."""
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level, logging.INFO),
    )

    shared: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _add_correlation_ids,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    renderer: Any = (
        structlog.processors.JSONRenderer()
        if settings.log_json
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=[*shared, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level, logging.INFO)
        ),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Uvicorn's own access log duplicates the middleware's; silence it.
    logging.getLogger("uvicorn.access").disabled = True


def get_logger(name: str) -> Any:
    """A bound structlog logger."""
    return structlog.get_logger(name)


def set_run_id(run_id: str | None) -> None:
    """Bind a generation-run id to the current async context."""
    _run_id.set(run_id)


def set_request_id(request_id: str | None) -> None:
    """Bind an HTTP request id to the current async context."""
    _request_id.set(request_id)


def current_run_id() -> str | None:
    return _run_id.get()
