"""API v1 router assembly.

Two surfaces:
  * `/internal/*` — the news engine, called by the Node backend with a service token.
  * `/admin/*`    — read-only observability, role-gated.

Health probes live outside both, in `main.py`, so an orchestrator can reach them
without a token.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.admin import runs
from app.api.v1.internal import news

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(news.router, prefix="/internal")
api_router.include_router(runs.router)
