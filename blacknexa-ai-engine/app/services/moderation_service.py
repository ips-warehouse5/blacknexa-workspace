"""Content-moderation service — the orchestration layer above the moderation graph.

Runs `prescreen → classify → finalise` for one request and records one run-log
row (INCIDENT_MODULE_PLAN.md §6.2). Deliberately thin, like `news_service`.

The failure mapping is the opposite of the news one, and that is the point. News
raises (502/503) because its caller only needs "it didn't work". Node's
moderation worker needs to know *what* happened to decide between retrying,
holding for a human and publishing, and its HTTP client collapses every non-2xx
into one opaque failure. So a valid request **always** gets a 200 whose `status`
says it (plan §6.1): `assessed`, `unavailable` or `blocked`. An `unavailable`
answer carries `retryable` and `unavailableReason` (review R20): an outage, a
deadline overrun or an unexpected error in this service is retryable; a
permanent provider failure or an unconfigured / not-yet-permitted Gemini is not.
Only an invalid request is an error (422, input never echoed — see
`core.errors`), and Node treats that as permanent.

An unexpected exception is therefore caught here and answered `unavailable`
rather than left to the central handler's 500. It is logged by type and code
location only: the exception message could quote member content.

The run log gets metadata alone — operation, Node's run id, outcome, model,
duration, caller. The outcome is the recommendation for an assessed verdict
(`approve` / `review`) and the status otherwise (`unavailable` / `blocked`).

Two bounds keep the answer inside Node's `MODERATION_AI_TIMEOUT_MS` (40 s) —
review R19. Before them, one 30 s provider attempt was assumed to be the whole
cost, but httpx applies that 30 s to each phase separately (waiting for a pooled
connection, uploading ~18 MiB of photos, reading), and the run-log insert was
awaited before returning, behind asyncpg's 60 s connect timeout. A run-log
database dropping packets therefore turned every verdict into a Node-side
timeout: billed Gemini calls thrown away, breaker failures, reports held.

* **A whole-pipeline deadline** of `MODERATION_TIMEOUT_SECONDS` + 2 s. Overrunning
  it cancels the provider call and answers `unavailable` / `timeout`,
  retryable — an answer Node can act on, instead of an abort it cannot read.
* **The run-log write is off the response path.** The route hands it to
  FastAPI's `BackgroundTasks`, which run after the response is sent. Direct
  callers (tests, scripts) still await it, and either way the write is bounded
  by `_RUN_LOG_BUDGET_SECONDS` and a late one is dropped with a warning: the
  run log is observability, never a reason to delay or fail a verdict.
"""

from __future__ import annotations

import asyncio
import os
import traceback

from starlette.background import BackgroundTasks

from app.ai.moderation_graph import run_moderation
from app.ai.moderation_state import ModerationState
from app.ai.nodes.moderation_finalise_node import build_response
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.run_log import record_operation
from app.schemas.moderation import ModerationRequest, ModerationResponse

logger = get_logger(__name__)

#: Headroom over the single provider attempt for prescreen, prompt building and
#: finalise — all local and fast. The total must stay well under Node's 40 s.
_PIPELINE_GRACE_SECONDS = 2.0

#: The longest a run-log insert may take before it is abandoned (review R19).
_RUN_LOG_BUDGET_SECONDS = 2.0


def _where(exc: BaseException) -> str:
    """`file.py:line` of the innermost frame — locates a bug without its message."""
    frames = traceback.extract_tb(exc.__traceback__)
    if not frames:
        return "unknown"
    last = frames[-1]
    return f"{os.path.basename(last.filename)}:{last.lineno}"


def _outcome(response: ModerationResponse) -> str:
    return response.recommendation if response.status == "assessed" else response.status


def _pipeline_budget_seconds() -> float:
    return settings.moderation_timeout_seconds + _PIPELINE_GRACE_SECONDS


def _internal_error(state: ModerationState, exc: BaseException) -> None:
    logger.error(
        "moderation_internal_error",
        run_id=state.run_id,
        error_type=type(exc).__name__,
        where=_where(exc),
    )
    state.mark_unavailable("internal_error")
    state.response = None


async def assess(
    request: ModerationRequest,
    *,
    caller: str = "",
    background: BackgroundTasks | None = None,
) -> ModerationResponse:
    """Assess one piece of member content. Never raises for a valid request.

    With `background`, the run-log row is written after the response has been
    sent (the route passes FastAPI's `BackgroundTasks`); without it, it is
    awaited here. Both paths are bounded — review R19.
    """
    state = ModerationState.from_request(request)

    budget = _pipeline_budget_seconds()
    deadline = asyncio.timeout(budget)
    try:
        async with deadline:
            state = await run_moderation(state)
    except TimeoutError as exc:
        if deadline.expired():
            # The nodes mutate `state` in place, so it still holds what the
            # prescreen found (`injectionSuspected` survives the timeout).
            logger.warning(
                "moderation_deadline_exceeded",
                run_id=state.run_id,
                budget_seconds=budget,
                elapsed_ms=state.elapsed_ms,
            )
            state.mark_unavailable("timeout")
            state.response = None
        else:
            _internal_error(state, exc)
    except Exception as exc:
        _internal_error(state, exc)

    response = state.response
    if response is None:
        # The graph halted before finalise (or a node raised): answer with the
        # normalised "no assessment" shape rather than an error. A `blocked`
        # verdict already recorded still stands.
        if state.status != "blocked" and state.failure:
            state.mark_unavailable(state.failure)
        elif state.status == "assessed":
            state.mark_unavailable("halted")
        response = build_response(state)

    outcome = _outcome(response)
    duration_ms = response.meta.durationMs
    if background is not None:
        background.add_task(
            _record_run_log,
            run_id=state.run_id,
            outcome=outcome,
            duration_ms=duration_ms,
            caller=caller,
        )
    else:
        await _record_run_log(
            run_id=state.run_id, outcome=outcome, duration_ms=duration_ms, caller=caller
        )
    return response


async def _record_run_log(*, run_id: str, outcome: str, duration_ms: int, caller: str) -> None:
    """Write the run-log row within `_RUN_LOG_BUDGET_SECONDS`, or give up.

    `record_operation` already swallows database errors; this bounds the one
    thing it cannot — a connect or pre-ping that hangs rather than fails.
    """
    try:
        await asyncio.wait_for(
            record_operation(
                run_id=run_id,
                operation="moderate",
                outcome=outcome,
                model=settings.moderation_model,
                duration_ms=duration_ms,
                caller=caller,
            ),
            timeout=_RUN_LOG_BUDGET_SECONDS,
        )
    except TimeoutError:
        logger.warning(
            "run_log_write_timeout",
            operation="moderate",
            run_id=run_id,
            budget_seconds=_RUN_LOG_BUDGET_SECONDS,
        )
