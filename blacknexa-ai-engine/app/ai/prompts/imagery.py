"""Image-prompt construction.

Ported from `ai_gateway.service.ts`. Two paths, exactly as in Node:

* the synthesiser supplies an `imagePrompt` describing the actual scene, or
* it omitted one, and a fallback is composed from the headline plus a per-category
  context phrase.

The category phrasing is what keeps a "Wealth" image from looking like a "Faith"
image when the model has nothing else to go on, so the map is reproduced verbatim.
"""

from __future__ import annotations

from typing import Final

# NewsCategory → context phrase. Keys match the Node `NewsCategory` union exactly.
CATEGORY_IMAGE_CONTEXT: Final[dict[str, str]] = {
    "business-wealth-stewardship": "entrepreneurship, business, enterprise, economic empowerment",
    "local-national-politics-civic": "civic policy, government, community, legislation, public life",
    "education-youth-advancement": "education, youth, training, students, learning",
    "clean-tech-and-advancements": "clean technology, innovation, infrastructure, green energy",
    "faith-commandments-morality": "faith, community, family, moral leadership, dignity",
    "hbcu-education": "HBCU campus, historically Black university, students, academic excellence",
    "breaking-geopolitical": "world events, geopolitics, international affairs, global impact",
    "civil-rights-police-accountability": (
        "civil rights, police accountability, anti-discrimination, justice, legal action"
    ),
}

_DEFAULT_CONTEXT = CATEGORY_IMAGE_CONTEXT["business-wealth-stewardship"]


def fallback_image_prompt(*, headline: str, category: str, scope: str) -> str:
    """Compose an image prompt when the synthesiser did not supply one."""
    scope_context = "international" if scope == "global" else scope
    category_context = CATEGORY_IMAGE_CONTEXT.get(category, _DEFAULT_CONTEXT)
    return (
        f"Professional photojournalistic editorial news photograph depicting: {headline}. "
        f"Context: {category_context}. Scope: {scope_context}. "
        "Documentary style, natural lighting, realistic, high detail, wide-angle composition. "
        "No text overlays, no watermarks, no logos. "
        "Quality: Associated Press / New York Times / Bloomberg photo desk standard."
    )


def resolve_image_prompt(
    *, image_prompt: str | None, headline: str, category: str, scope: str
) -> str:
    """The model-supplied prompt when usable, otherwise the composed fallback."""
    if image_prompt and image_prompt.strip():
        return image_prompt.strip()
    return fallback_image_prompt(headline=headline, category=category, scope=scope)
