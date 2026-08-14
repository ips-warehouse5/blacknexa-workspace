"""Admin observability routes.

Read-only visibility into what the engine has been doing: run counts, latency,
failure mix, and how often the model tried to cite a source it was never given.

`auditor` can read; `admin` is additionally allowed to prune. Roles are listed
explicitly per route rather than relying on an implicit hierarchy, so the permitted
set is readable where it is enforced.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.logging import get_logger
from app.core.security import TokenPayload, require_roles
from app.repositories import run_log

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/runs", summary="Recent generation runs")
async def list_runs(
    _caller: Annotated[TokenPayload, Depends(require_roles("admin", "auditor"))],
    limit: int = Query(default=50, ge=1, le=500),
    outcome: str | None = Query(default=None, max_length=48),
    operation: str | None = Query(default=None, max_length=32),
) -> dict[str, Any]:
    """Newest first, optionally filtered by outcome or operation."""
    runs = await run_log.list_runs(limit=limit, outcome=outcome, operation=operation)
    return {"total": len(runs), "runs": runs}


@router.get("/runs/summary", summary="Aggregate run health")
async def runs_summary(
    _caller: Annotated[TokenPayload, Depends(require_roles("admin", "auditor"))],
    hours: int = Query(default=24, ge=1, le=720),
) -> dict[str, Any]:
    """Totals, average latency, outcome mix, and the two security counters.

    A rising `sourcesRejected` means the model is citing URLs it was never given —
    either hallucination or an injection landing. `injectionFlagged` counts inputs
    that tripped the prompt screen.
    """
    return await run_log.summarise(hours=hours)


@router.post("/runs/prune", summary="Delete runs past the retention window")
async def prune_runs(
    _caller: Annotated[TokenPayload, Depends(require_roles("admin"))],
    retention_days: int | None = Query(default=None, alias="retentionDays", ge=1, le=3650),
) -> dict[str, Any]:
    """Manual counterpart to the retention worker."""
    removed = await run_log.prune_old_runs(retention_days)
    return {"removed": removed}
