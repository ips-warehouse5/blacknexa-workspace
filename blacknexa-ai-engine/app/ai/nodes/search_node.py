"""Node 1 — grounded web search.

Pulls real, current results for the topic. These become the only material the
article may cite, so an empty result set is a hard stop: without grounding the
engine would be inventing, which is precisely what the product forbids.
"""

from __future__ import annotations

from app.ai.state import GenerationState
from app.core.logging import get_logger
from app.integrations.search.exa import build_sources_block, search_web

logger = get_logger(__name__)


async def run(state: GenerationState) -> GenerationState:
    """Populate `hits` and `sources_block`, or fail the run."""
    hits = await search_web(
        state.topic_prompt,
        num_results=state.search_num_results,
        max_characters=state.search_max_characters,
    )

    if not hits:
        # Mirrors `if (hits.length === 0) return null;` in generateCore. Node turns
        # this into the 502 the app already displays.
        logger.warning("search_no_results", topic_preview=state.topic_prompt[:100])
        state.fail("no_source_material")
        return state

    state.hits = hits
    state.sources_block = build_sources_block(hits)
    state.notes["sources_found"] = len(hits)

    logger.info("search_node_complete", hits=len(hits), mode=state.mode)
    return state
