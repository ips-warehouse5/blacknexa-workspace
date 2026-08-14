"""The generation graph.

The pipeline the Node engine runs inline, expressed as explicit nodes with a
typed state between them:

    search ──► synthesise ──► filter sources ──► image (deep path only)

Each node is an `async (state) -> state` function, and the runner stops at the
first node that sets `state.failure`. That short-circuit is what preserves Node's
behaviour of returning `null` the moment a stage cannot proceed, rather than
pressing on with half a result.

This is a deliberately small runner rather than a workflow framework. The shape —
discrete nodes, a typed state object, a linear edge list — is the part that
matters, and it is what a LangGraph `StateGraph` would need anyway if the pipeline
later grows conditional branches or retries per node. Adopting one then is a
change to this file only.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.ai.nodes import image_node, search_node, source_filter_node, synthesis_node
from app.ai.state import GenerationState
from app.core.logging import get_logger, set_run_id

logger = get_logger(__name__)

Node = Callable[[GenerationState], Awaitable[GenerationState]]

#: Executed in order. Every node is responsible for no-op'ing when it has nothing
#: to do (`state.failed`, or an image not requested).
PIPELINE: tuple[tuple[str, Node], ...] = (
    ("search", search_node.run),
    ("synthesis", synthesis_node.run),
    ("source_filter", source_filter_node.run),
    ("image", image_node.run),
)


async def run_generation(state: GenerationState) -> GenerationState:
    """Execute the pipeline, stopping at the first failure."""
    # Binds the run id to every log line emitted downstream, so one article's whole
    # pipeline can be pulled out of the log by that id.
    set_run_id(state.run_id)

    logger.info(
        "generation_started",
        mode=state.mode,
        category=state.category,
        scope=state.scope,
        want_image=state.want_image,
    )

    try:
        for name, node in PIPELINE:
            state = await node(state)
            if state.failed:
                logger.warning(
                    "generation_halted",
                    node=name,
                    reason=state.failure,
                    elapsed_ms=state.elapsed_ms,
                )
                return state

        logger.info(
            "generation_complete",
            elapsed_ms=state.elapsed_ms,
            sources=len(state.verified_sources),
            image=state.image is not None,
        )
        return state
    finally:
        set_run_id(None)
