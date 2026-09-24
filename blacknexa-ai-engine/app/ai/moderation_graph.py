"""The moderation graph.

    prescreen ──► classify ──► finalise

The same small runner as `graph.py` (INCIDENT_MODULE_PLAN.md §6.2): explicit
nodes, a typed state, a linear edge list, the run id bound to every log line, and
a stop at the first node that sets `state.failure`. It is a second runner rather
than a generalised one because the node signature is typed to the state, and the
two pipelines share nothing else.

What differs is what counts as failure. For news, "the model gave nothing
usable" halts the graph and becomes a 5xx. Here `unavailable` and `blocked` are
verdicts Node acts on, so classify records them on `state.status` and finalise
still runs to shape them; the short-circuit is kept for a node that genuinely
cannot continue, and the service answers `unavailable` if it ever fires.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.ai.moderation_state import ModerationState
from app.ai.nodes import (
    moderation_classify_node,
    moderation_finalise_node,
    moderation_prescreen_node,
)
from app.core.logging import get_logger, set_run_id

logger = get_logger(__name__)

Node = Callable[[ModerationState], Awaitable[ModerationState]]

#: Executed in order. Every node no-ops when `state.failed`.
PIPELINE: tuple[tuple[str, Node], ...] = (
    ("prescreen", moderation_prescreen_node.run),
    ("classify", moderation_classify_node.run),
    ("finalise", moderation_finalise_node.run),
)


async def run_moderation(state: ModerationState) -> ModerationState:
    """Execute the pipeline, stopping at the first failure."""
    # Node's run id, so one assessment's log lines can be joined to the
    # `moderation_runs` row that asked for it.
    set_run_id(state.run_id)

    logger.info(
        "moderation_started",
        target_type=state.target_type,
        images=len(state.images),
        flagged_categories=len(state.flagged_categories),
        keyword_signals=len(state.keyword_signals),
    )

    try:
        for name, node in PIPELINE:
            state = await node(state)
            if state.failed:
                logger.warning(
                    "moderation_halted",
                    node=name,
                    reason=state.failure,
                    elapsed_ms=state.elapsed_ms,
                )
                return state

        logger.info(
            "moderation_complete",
            status=state.status,
            recommendation=state.response.recommendation if state.response else None,
            elapsed_ms=state.elapsed_ms,
        )
        return state
    finally:
        set_run_id(None)
