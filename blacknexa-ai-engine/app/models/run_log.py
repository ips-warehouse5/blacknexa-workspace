"""Generation run log.

Operational observability only. Every generation call spends real money at the AI
gateway, and until now there was no record of how many ran, how long they took, how
often grounding failed, or how often the model tried to cite a source it was never
given. This table answers those.

**It never stores article content.** Headline, summary, body, prompts and source
excerpts are all excluded by design: the article itself is Node's to persist, and
duplicating it here would create a second copy of user-visible content in a service
that has no business holding one. Only the topic *preview* is kept, truncated, for
correlating a run with a request.

Optional: with no `DATABASE_URL` the engine runs fully stateless and every write
here becomes a no-op.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for this service's own tables."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GenerationRun(Base):
    """One pass through the generation pipeline."""

    __tablename__ = "ai_generation_runs"

    # UUID primary key — nothing outside this service round-trips it, so unlike the
    # Node tables there is no wire contract forcing a different shape.
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    #: Correlates with the `run_id` on every log line from the same run.
    run_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    #: "synthesize" | "image" | "audio" | "translate"
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    #: "fast" | "deep" | "" for non-synthesis operations.
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="")

    #: "success" | "no_source_material" | "synthesis_failed" | "gateway_unavailable"
    outcome: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    sources_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sources_cited: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Citations dropped because the URL was never in the retrieved set. A rising
    #: count means the model is inventing sources or an injection is landing.
    sources_rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_chars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    image_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: True when retrieved content or the topic tripped the injection screen.
    injection_flagged: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )

    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: Truncated topic, for correlation. Never the article body.
    topic_preview: Mapped[str] = mapped_column(Text, nullable=False, default="")
    caller: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )

    __table_args__ = (
        # Supports the admin listing (recent first, filtered by outcome) and the
        # retention sweep, which deletes by `created_at`.
        Index("idx_runs_created_outcome", "created_at", "outcome"),
        Index("idx_runs_operation_created", "operation", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<GenerationRun {self.run_id} {self.operation}/{self.mode} "
            f"{self.outcome} {self.duration_ms}ms>"
        )
