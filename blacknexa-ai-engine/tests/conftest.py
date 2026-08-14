"""Shared test fixtures.

Environment is set before `app` is imported so `core.config` validates against test
values rather than a developer's `.env`.
"""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SERVICE_JWT_SECRET", "test-service-secret-that-is-long-enough-32")
os.environ.setdefault("AI_TOOLKIT_URL", "https://toolkit.test")
os.environ.setdefault("AI_TOOLKIT_SECRET_KEY", "test-gateway-key")
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("LOG_LEVEL", "ERROR")

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_service_token
from app.main import app

#: Repository root, for locating the Node source in parity tests.
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
NODE_BACKEND = WORKSPACE_ROOT / "blacknexa-backend"


@pytest.fixture(scope="session")
def service_token() -> str:
    return create_service_token(subject="test-suite", scope="service", role="service")


@pytest.fixture(scope="session")
def admin_token() -> str:
    return create_service_token(subject="test-admin", scope="admin", role="admin")


@pytest.fixture(scope="session")
def auditor_token() -> str:
    return create_service_token(subject="test-auditor", scope="admin", role="auditor")


@pytest.fixture
def client() -> TestClient:
    """Unauthenticated client."""
    return TestClient(app)


@pytest.fixture
def auth_client(service_token: str) -> TestClient:
    """Client carrying a valid service token."""
    return TestClient(app, headers={"Authorization": f"Bearer {service_token}"})


@pytest.fixture
def exa_hit_factory():  # type: ignore[no-untyped-def]
    """Build an `ExaHit` with sensible defaults."""
    from app.schemas.news import ExaHit

    def _make(
        url: str = "https://reuters.com/article-1",
        title: str = "Reuters report",
        highlights: list[str] | None = None,
        published: str | None = "2026-08-01T00:00:00Z",
    ) -> ExaHit:
        return ExaHit(
            title=title,
            url=url,
            publishedDate=published,
            highlights=highlights if highlights is not None else ["A verified excerpt."],
        )

    return _make
