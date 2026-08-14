"""Run-log repository.

All queries go through SQLAlchemy with bound parameters — no string interpolation
of caller input anywhere.

Every write is best-effort: a logging failure must never turn a successful
generation into an error response. Failures are logged and swallowed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select

from app.ai.state import GenerationState
from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import session_scope
from app.models.run_log import GenerationRun

logger = get_logger(__name__)

#: Enough to correlate a run with a request; never the full prompt.
_TOPIC_PREVIEW_CHARS = 200


async def record_run(
    state: GenerationState,
    *,
    outcome: str,
    caller: str = "",
) -> None:
    """Persist a synthesis run. Silent no-op when persistence is disabled."""
    await _insert(
        GenerationRun(
            run_id=state.run_id,
            operation="synthesize",
            mode=state.mode,
            category=state.category,
            scope=state.scope,
            outcome=outcome,
            model=settings.synthesis_model,
            sources_found=len(state.hits),
            sources_cited=len(state.verified_sources),
            sources_rejected=int(state.notes.get("sources_rejected", 0)),
            content_chars=len(state.synthesis.content) if state.synthesis else 0,
            image_generated=state.image is not None,
            injection_flagged=state.injection_flagged,
            duration_ms=state.elapsed_ms,
            topic_preview=state.topic_prompt[:_TOPIC_PREVIEW_CHARS],
            caller=caller,
        )
    )


async def record_operation(
    *,
    run_id: str,
    operation: str,
    outcome: str,
    model: str,
    duration_ms: int,
    language: str = "",
    caller: str = "",
) -> None:
    """Persist a non-synthesis operation (image, audio, translate)."""
    await _insert(
        GenerationRun(
            run_id=run_id,
            operation=operation,
            outcome=outcome,
            model=model,
            language=language,
            duration_ms=duration_ms,
            caller=caller,
        )
    )


async def _insert(row: GenerationRun) -> None:
    try:
        async with session_scope() as session:
            if session is None:
                return
            session.add(row)
    except Exception as exc:
        logger.warning(
            "run_log_write_failed",
            error_type=type(exc).__name__,
            error=str(exc),
        )


async def list_runs(
    *,
    limit: int = 50,
    outcome: str | None = None,
    operation: str | None = None,
) -> list[dict[str, Any]]:
    """Recent runs, newest first. Empty list when persistence is disabled."""
    async with session_scope() as session:
        if session is None:
            return []

        stmt = select(GenerationRun).order_by(GenerationRun.created_at.desc()).limit(limit)
        if outcome:
            stmt = stmt.where(GenerationRun.outcome == outcome)
        if operation:
            stmt = stmt.where(GenerationRun.operation == operation)

        rows = (await session.execute(stmt)).scalars().all()
        return [
            {
                "id": r.id,
                "runId": r.run_id,
                "operation": r.operation,
                "mode": r.mode,
                "category": r.category,
                "scope": r.scope,
                "language": r.language,
                "outcome": r.outcome,
                "model": r.model,
                "sourcesFound": r.sources_found,
                "sourcesCited": r.sources_cited,
                "sourcesRejected": r.sources_rejected,
                "contentChars": r.content_chars,
                "imageGenerated": r.image_generated,
                "injectionFlagged": r.injection_flagged,
                "durationMs": r.duration_ms,
                "topicPreview": r.topic_preview,
                "createdAt": r.created_at.isoformat(),
            }
            for r in rows
        ]


async def summarise(hours: int = 24) -> dict[str, Any]:
    """Aggregates over a recent window — the cost and health view."""
    async with session_scope() as session:
        if session is None:
            return {"persistenceEnabled": False}

        since = datetime.now(UTC) - timedelta(hours=hours)

        totals = (
            await session.execute(
                select(
                    func.count(GenerationRun.id),
                    func.coalesce(func.avg(GenerationRun.duration_ms), 0),
                    func.coalesce(func.sum(GenerationRun.sources_rejected), 0),
                    func.count(GenerationRun.id).filter(GenerationRun.injection_flagged),
                ).where(GenerationRun.created_at >= since)
            )
        ).one()

        by_outcome = (
            await session.execute(
                select(GenerationRun.outcome, func.count(GenerationRun.id))
                .where(GenerationRun.created_at >= since)
                .group_by(GenerationRun.outcome)
            )
        ).all()

        return {
            "persistenceEnabled": True,
            "windowHours": hours,
            "totalRuns": int(totals[0] or 0),
            "avgDurationMs": round(float(totals[1] or 0), 1),
            "sourcesRejected": int(totals[2] or 0),
            "injectionFlagged": int(totals[3] or 0),
            "byOutcome": {outcome: count for outcome, count in by_outcome},
        }


async def prune_old_runs(retention_days: int | None = None) -> int:
    """Delete runs past the retention window. Returns the row count removed."""
    days = retention_days if retention_days is not None else settings.run_log_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=days)

    async with session_scope() as session:
        if session is None:
            return 0
        result = await session.execute(
            delete(GenerationRun).where(GenerationRun.created_at < cutoff)
        )
        # `Result` has no typed `rowcount`; DELETE returns a CursorResult that does.
        removed: int = getattr(result, "rowcount", 0) or 0
        if removed:
            logger.info("run_log_pruned", removed=removed, retention_days=days)
        return removed
