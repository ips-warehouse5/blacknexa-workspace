"""Moderation pipeline state.

The value that flows along `prescreen → classify → finalise`
(INCIDENT_MODULE_PLAN.md §6.2), in the same shape as `GenerationState`: a mutable
dataclass, never serialised, where each node writes only its own slice so it can
be tested with a hand-built state and no network.

One difference from the news state is deliberate. News treats "the model gave
nothing usable" as a *failure* that stops the graph and becomes a 5xx. Here
`unavailable` and `blocked` are *verdicts* — the contract answers them with a 200
that Node acts on (retry, or hold for a human) — so they live in `status`, and
the finalise node still runs to give them the normalised shape. `status` starts
as `unavailable`: a run that never reaches a successful classification can only
ever report "no assessment", never an accidental approval. `failure` remains for a
node that cannot proceed at all; the runner short-circuits on it exactly as the
news graph does, and the service then answers `unavailable`.

`retryable` travels with `unavailable_reason` (review R20). Node retries an
`unavailable` answer with backoff and its reconciler re-runs the hold later, which
is right for an outage and wrong for a failure that repeats on every attempt — a
provider 400, a RECITATION finish at temperature 0, an unconfigured key. Those are
marked `retryable=False`, so Node can record a permanent failure instead of
paying for four more identical calls every quarter of an hour. It only means
something while `status` is `unavailable`; the other transitions reset it.

The state holds member content for the duration of one request only. None of it
is logged (only lengths, counts and pattern names are) and none of it is
persisted — the run log records metadata alone.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.schemas.moderation import (
    ModerationImage,
    ModerationRequest,
    ModerationResponse,
    ModerationStatus,
    PolicyCategory,
    ReportCategory,
    TargetType,
)


@dataclass
class ModerationState:
    """State threaded through the moderation graph."""

    # ── Input ────────────────────────────────────────────────────────────────
    target_type: TargetType
    body: str
    category: ReportCategory | None = None
    title: str | None = None
    location_label: str | None = None
    parent_title: str | None = None
    urgent: bool = False
    flagged_categories: list[PolicyCategory] = field(default_factory=list)
    #: `(category, term)` pairs from Node's keyword matcher.
    keyword_signals: list[tuple[PolicyCategory, str]] = field(default_factory=list)
    images: list[ModerationImage] = field(default_factory=list)

    # ── Correlation ──────────────────────────────────────────────────────────
    #: Node's run id exactly as sent — echoed in `meta.runId`.
    request_run_id: str = ""
    #: The 32-hex form bound to log lines and written to the run log.
    run_id: str = ""
    started_at: float = field(default_factory=time.perf_counter)

    # ── Prescreen output ─────────────────────────────────────────────────────
    #: Names of the injection / boundary signatures the member text tripped.
    injection_signals: tuple[str, ...] = ()

    # ── Classify output ──────────────────────────────────────────────────────
    status: ModerationStatus = "unavailable"
    #: Why no assessment was made — an operational code, logged and summarised,
    #: never member content.
    unavailable_reason: str = "not_classified"
    #: Whether retrying could give a different answer. Meaningful only while
    #: `status` is `unavailable` (review R20).
    retryable: bool = True
    block_reason: str | None = None
    #: The parsed model JSON, before normalisation.
    raw_output: dict[str, Any] | None = None
    #: Images actually sent to the model (the first N of `images`).
    images_sent: int = 0

    # ── Finalise output ──────────────────────────────────────────────────────
    response: ModerationResponse | None = None

    # ── Diagnostics ──────────────────────────────────────────────────────────
    failure: str | None = None
    notes: dict[str, Any] = field(default_factory=dict)

    # ── Construction ─────────────────────────────────────────────────────────

    @classmethod
    def from_request(cls, request: ModerationRequest) -> ModerationState:
        """Build the initial state from a validated request."""
        return cls(
            target_type=request.targetType,
            body=request.body,
            category=request.category,
            title=request.title,
            location_label=request.locationLabel,
            parent_title=request.parentTitle,
            urgent=request.urgent,
            flagged_categories=list(request.flaggedCategories),
            keyword_signals=[(signal.category, signal.term) for signal in request.keywordSignals],
            images=list(request.images),
            request_run_id=request.runId,
            run_id=request.log_run_id,
        )

    # ── Derived ──────────────────────────────────────────────────────────────

    @property
    def injection_suspected(self) -> bool:
        return bool(self.injection_signals)

    @property
    def failed(self) -> bool:
        return self.failure is not None

    @property
    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.started_at) * 1000)

    # ── Transitions ──────────────────────────────────────────────────────────

    def fail(self, reason: str) -> None:
        """Mark the run as unable to continue (the runner stops here)."""
        self.failure = reason

    def mark_assessed(self, output: dict[str, Any], *, images_sent: int) -> None:
        """The model answered with a JSON object; finalise normalises it."""
        self.status = "assessed"
        self.raw_output = output
        self.images_sent = images_sent
        self.block_reason = None
        self.retryable = True

    def mark_unavailable(self, reason: str, *, retryable: bool = True) -> None:
        """No usable answer.

        `retryable=True` (an outage): Node backs off and retries, then holds
        (reports) or falls back. `retryable=False`: the same request would fail
        the same way, so Node should not spend another attempt on it.
        """
        self.status = "unavailable"
        self.unavailable_reason = reason
        self.retryable = retryable
        self.raw_output = None
        self.images_sent = 0

    def mark_blocked(self, reason: str) -> None:
        """Gemini refused the content. Node holds it for a human (`ai_blocked`)."""
        self.status = "blocked"
        self.block_reason = reason
        self.retryable = True
        self.raw_output = None
        self.images_sent = 0
