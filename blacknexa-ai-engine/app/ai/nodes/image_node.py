"""Node 4 — story-matching imagery.

Runs only on the deep path (or when a caller explicitly asks for an image). On the
fast path Node generates the image in the background after responding, so the
reader never waits on it.

A failure here is never fatal to the run: the article is still publishable, and
Node substitutes a curated photo from its category pools.
"""

from __future__ import annotations

from app.ai.prompts.imagery import resolve_image_prompt
from app.ai.state import GenerationState
from app.core.logging import get_logger
from app.integrations.llm.image import generate_image

logger = get_logger(__name__)


async def run(state: GenerationState) -> GenerationState:
    """Populate `state.image` when requested."""
    if state.failed or state.synthesis is None:
        return state
    if not state.want_image:
        return state

    prompt = resolve_image_prompt(
        image_prompt=state.synthesis.image_prompt,
        headline=state.synthesis.headline,
        category=state.category,
        scope=state.scope,
    )

    image, duration_ms = await generate_image(prompt)
    state.image = image
    state.notes["image_duration_ms"] = duration_ms

    if image is None:
        # Not a failure — the caller falls back to a curated photo.
        logger.warning("image_node_no_image", run_id=state.run_id)

    return state
