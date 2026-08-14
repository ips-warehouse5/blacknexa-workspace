"""Pipeline state.

The generation pipeline is a small directed graph, and this is the value that
flows along its edges. Each node reads what it needs and writes its own slice, so
a node can be tested with a hand-built state and no network.

`GenerationState` is a mutable dataclass rather than a Pydantic model on purpose:
it never crosses the service boundary, it is written to on every hop, and the
validated shapes are already the `schemas.news` models it carries.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.schemas.news import (
    ExaHit,
    GeneratedImage,
    NewsCategory,
    NewsScope,
    SynthesisMode,
    VerifiedSource,
)


@dataclass
class SynthesisOutput:
    """The parsed JSON the synthesis model returned, before source filtering."""

    headline: str = ""
    summary: str = ""
    content: str = ""
    cited_sources: list[dict[str, str]] = field(default_factory=list)
    godly_principle_alignment: str = ""
    image_prompt: str = ""


@dataclass
class GenerationState:
    """State threaded through the generation graph."""

    # ── Input ────────────────────────────────────────────────────────────────
    topic_prompt: str
    category: NewsCategory
    scope: NewsScope
    mode: SynthesisMode = "fast"
    want_image: bool = False

    # ── Correlation ──────────────────────────────────────────────────────────
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    started_at: float = field(default_factory=time.perf_counter)

    # ── Stage output ─────────────────────────────────────────────────────────
    hits: list[ExaHit] = field(default_factory=list)
    sources_block: str = ""
    synthesis: SynthesisOutput | None = None
    verified_sources: list[VerifiedSource] = field(default_factory=list)
    image: GeneratedImage | None = None

    # ── Diagnostics ──────────────────────────────────────────────────────────
    # Set when a node cannot proceed. The graph runner stops on the first failure
    # and the caller maps it to an HTTP status.
    failure: str | None = None
    injection_flagged: bool = False
    notes: dict[str, Any] = field(default_factory=dict)

    # ── Derived ──────────────────────────────────────────────────────────────

    @property
    def is_fast(self) -> bool:
        return self.mode == "fast"

    @property
    def failed(self) -> bool:
        return self.failure is not None

    @property
    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.started_at) * 1000)

    def fail(self, reason: str) -> None:
        """Mark the run as unable to continue."""
        self.failure = reason

    # ── Tuning, ported verbatim from ai_gateway.service.ts ───────────────────
    #
    # `generateCore`: searchWeb(topic, fast ? 8 : 12, fast ? 800 : 2400)
    # `synthesise`:   max_tokens: fast ? 2800 : 7200, temperature: 0.3

    @property
    def search_num_results(self) -> int:
        return 8 if self.is_fast else 12

    @property
    def search_max_characters(self) -> int:
        return 800 if self.is_fast else 2400

    @property
    def synthesis_max_tokens(self) -> int:
        return 2800 if self.is_fast else 7200

    @property
    def synthesis_temperature(self) -> float:
        return 0.3
