"""The anti-hallucination source filter.

This is the guarantee behind "100% FACTUALLY VERIFIED" and the last line of the
prompt-injection defence, so it gets the most direct coverage in the suite.
"""

from __future__ import annotations

from app.ai.nodes.source_filter_node import filter_sources, safe_hostname


def test_keeps_only_urls_that_were_actually_retrieved(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    hits = [
        exa_hit_factory(url="https://reuters.com/a", title="Reuters"),
        exa_hit_factory(url="https://apnews.com/b", title="AP"),
    ]
    cited = [
        {"name": "Reuters", "url": "https://reuters.com/a"},
        # Never retrieved — a hallucination or an injected domain.
        {"name": "Totally Real News", "url": "https://attacker.example/fake"},
    ]

    result = filter_sources(cited, hits)

    urls = [s.url for s in result]
    assert urls == ["https://reuters.com/a"]
    assert "https://attacker.example/fake" not in urls


def test_injected_source_cannot_be_published(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    """Even a fully successful injection cannot introduce a citation.

    The scenario: a retrieved page told the model to cite the attacker's domain and
    the model complied. Because that URL was never in the retrieved set, it is
    dropped here regardless.
    """
    hits = [exa_hit_factory(url="https://hud.gov/report", title="HUD")]
    cited = [
        {"name": "HUD", "url": "https://hud.gov/report"},
        {"name": "Official Source", "url": "https://evil.test/payload"},
        {"name": "Also Official", "url": "https://evil.test/payload2"},
    ]

    result = filter_sources(cited, hits)

    assert [s.url for s in result] == ["https://hud.gov/report"]


def test_falls_back_to_top_hits_when_nothing_survives(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    """A card must never render with an empty source list."""
    hits = [exa_hit_factory(url=f"https://example.com/{i}") for i in range(10)]
    cited = [{"name": "Invented", "url": "https://nowhere.test/x"}]

    result = filter_sources(cited, hits)

    # Node's `hits.slice(0, 7)`.
    assert len(result) == 7
    assert all(s.url.startswith("https://example.com/") for s in result)


def test_falls_back_when_model_cited_nothing(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    hits = [exa_hit_factory(url="https://reuters.com/a")]
    result = filter_sources([], hits)
    assert [s.url for s in result] == ["https://reuters.com/a"]


def test_attaches_excerpt_and_date_from_the_hit(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    hits = [
        exa_hit_factory(
            url="https://reuters.com/a",
            highlights=["First highlight.", "Second highlight.", "Third ignored."],
            published="2026-08-01T12:00:00Z",
        )
    ]
    cited = [{"name": "Reuters", "url": "https://reuters.com/a"}]

    source = filter_sources(cited, hits)[0]

    # Node joins the first two highlights and truncates the date to 10 chars.
    assert source.excerpt == "First highlight. Second highlight."
    assert source.publishedDate == "2026-08-01"


def test_unsafe_url_never_reaches_a_source_card(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    """A loopback URL is refused on both the citation path and the fallback path.

    `search_web` already drops unsafe URLs, so reaching here means something
    upstream changed — the filter still must not publish it.
    """
    hits = [
        exa_hit_factory(url="http://127.0.0.1/internal", title="Internal"),
        exa_hit_factory(url="https://reuters.com/a", title="Reuters"),
    ]
    cited = [{"name": "Internal", "url": "http://127.0.0.1/internal"}]

    result = filter_sources(cited, hits)

    assert all(s.url != "http://127.0.0.1/internal" for s in result)
    # The safe hit is still offered, so the card is not left empty.
    assert [s.url for s in result] == ["https://reuters.com/a"]


def test_name_falls_back_to_hostname(exa_hit_factory) -> None:  # type: ignore[no-untyped-def]
    hits = [exa_hit_factory(url="https://www.reuters.com/a", title=None)]
    cited = [{"name": "", "url": "https://www.reuters.com/a"}]

    assert filter_sources(cited, hits)[0].name == "reuters.com"


def test_safe_hostname_strips_www_and_survives_bad_input() -> None:
    assert safe_hostname("https://www.bloomberg.com/x") == "bloomberg.com"
    assert safe_hostname("https://hud.gov/y") == "hud.gov"
    # Node's `safeHostname` returns the input unchanged when it will not parse.
    assert safe_hostname("not a url") == "not a url"
