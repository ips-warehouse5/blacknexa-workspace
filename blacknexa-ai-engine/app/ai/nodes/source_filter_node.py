"""Node 3 — the anti-hallucination source filter.

This is the guarantee behind the "100% FACTUALLY VERIFIED" badge, and it is ported
from `filterSources()` unchanged in behaviour.

The rule: a cited URL survives only if it appears **verbatim** in the set the
search stage actually returned. Anything the model invented is dropped. If nothing
survives, the top search hits are substituted directly, so a source card always
carries a real, traceable link rather than an empty list.

It is also the last line of the prompt-injection defence. Even a fully successful
injection — a page that convinces the model to cite an attacker's domain — cannot
get that domain published, because the URL was never in the retrieved set. That is
why this runs on the model's output rather than trusting the prompt directive alone.
"""

from __future__ import annotations

from urllib.parse import urlparse

from app.ai.state import GenerationState
from app.core.logging import get_logger
from app.core.prompt_safety import is_safe_source_url
from app.integrations.search.exa import source_excerpt
from app.schemas.news import ExaHit, VerifiedSource

logger = get_logger(__name__)

# Node: `hits.slice(0, 7)` when falling back to the raw hits.
_FALLBACK_SOURCE_LIMIT = 7


def safe_hostname(url: str) -> str:
    """A clean hostname for display, e.g. "reuters.com".

    Ports the Node `safeHostname`: strip a leading `www.`, and fall back to the
    raw string when the URL will not parse.
    """
    try:
        host = urlparse(url).hostname
    except ValueError:
        return url
    if not host:
        return url
    return host.removeprefix("www.")


def _from_hit(hit: ExaHit) -> VerifiedSource:
    """Build a source card straight from a search hit."""
    excerpt = source_excerpt(hit)
    return VerifiedSource(
        name=hit.title or safe_hostname(hit.url),
        url=hit.url,
        excerpt=excerpt or None,
        publishedDate=hit.publishedDate[:10] if hit.publishedDate else None,
    )


def filter_sources(
    cited: list[dict[str, str]], hits: list[ExaHit]
) -> list[VerifiedSource]:
    """Intersect the model's citations with the real search hits.

    Returns the surviving citations, or the top hits when none survive.
    """
    hit_by_url = {hit.url: hit for hit in hits}

    def top_hits() -> list[VerifiedSource]:
        # The safety check applies on this path too. `search_web` already drops
        # unsafe URLs, so this is defence in depth — but a URL about to be printed
        # on a public source card is validated no matter which path produced it.
        safe = [h for h in hits if is_safe_source_url(h.url)]
        return [_from_hit(h) for h in safe[:_FALLBACK_SOURCE_LIMIT]]

    if not cited:
        # The model cited nothing usable — fall back to the hits themselves so the
        # card still carries real links.
        return top_hits()

    survivors: list[VerifiedSource] = []
    for source in cited:
        url = source.get("url", "")
        hit = hit_by_url.get(url)
        if hit is None:
            # Not in the retrieved set: either a hallucination or an injected
            # domain. Either way it does not get published.
            continue
        # Belt and braces — the URL came from the gateway, but it is about to be
        # rendered publicly.
        if not is_safe_source_url(url):
            continue

        excerpt = source_excerpt(hit)
        survivors.append(
            VerifiedSource(
                name=source.get("name") or safe_hostname(url),
                url=url,
                excerpt=excerpt or None,
                publishedDate=hit.publishedDate[:10] if hit.publishedDate else None,
            )
        )

    return survivors if survivors else top_hits()


async def run(state: GenerationState) -> GenerationState:
    """Populate `state.verified_sources`."""
    if state.failed or state.synthesis is None:
        return state

    cited = state.synthesis.cited_sources
    state.verified_sources = filter_sources(cited, state.hits)

    rejected = len(cited) - sum(
        1 for c in cited if c.get("url") in {h.url for h in state.hits}
    )
    if rejected > 0:
        # A non-zero count here is exactly the signal that the model tried to cite
        # something it was not given.
        logger.warning(
            "sources_rejected",
            cited=len(cited),
            rejected=rejected,
            kept=len(state.verified_sources),
        )
        state.notes["sources_rejected"] = rejected

    state.notes["sources_cited"] = len(state.verified_sources)
    logger.info(
        "source_filter_complete",
        cited=len(cited),
        verified=len(state.verified_sources),
    )
    return state
