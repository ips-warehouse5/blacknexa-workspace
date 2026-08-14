"""Rate limiting, with the limiter actually enabled.

The rest of the suite disables rate limiting so tests do not throttle each other.
That gap hid a real defect: `slowapi`'s `@limiter.limit` decorator injects
`RateLimit-*` headers into the endpoint's `response` argument, and every decorated
endpoint that omitted one raised a 500 the moment limiting was switched on — which
is exactly how it would have been deployed.

These tests build a second app with limits on, so the decorated path is exercised.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def limited_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client whose app was built with rate limiting enabled.

    The modules are reloaded so the limiter is constructed against the patched
    settings rather than the session-wide test config.
    """
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RATE_LIMIT_DEFAULT", "1000/minute")
    monkeypatch.setenv("RATE_LIMIT_GENERATION", "3/minute")

    from app.core import config as config_module

    config_module.get_settings.cache_clear()
    monkeypatch.setattr(config_module, "settings", config_module.Settings())  # type: ignore[call-arg]

    import app.api.rate_limit as rate_limit_module

    importlib.reload(rate_limit_module)
    import app.api.v1.internal.news as news_module

    importlib.reload(news_module)
    import app.api.v1.router as router_module

    importlib.reload(router_module)
    import app.main as main_module

    importlib.reload(main_module)

    from app.core.security import create_service_token

    token = create_service_token(subject="rate-limit-test")
    client = TestClient(main_module.app, headers={"Authorization": f"Bearer {token}"})

    yield client

    # Restore the shared modules for the rest of the session.
    config_module.get_settings.cache_clear()
    importlib.reload(rate_limit_module)
    importlib.reload(news_module)
    importlib.reload(router_module)
    importlib.reload(main_module)


def test_decorated_endpoint_works_when_limiting_is_on(limited_client: TestClient) -> None:
    """The regression guard.

    A rate-limited endpoint must return its normal response, not a 500 from the
    header-injection step.
    """
    response = limited_client.post(
        "/api/v1/internal/news/translate",
        json={"language": "en", "headline": "H", "summary": "S", "content": "C"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["translation"]["language"] == "en"


def test_rate_limit_headers_are_emitted(limited_client: TestClient) -> None:
    response = limited_client.post(
        "/api/v1/internal/news/translate",
        json={"language": "en", "headline": "H"},
    )
    header_names = {k.lower() for k in response.headers}
    assert any(name.startswith("ratelimit") or name == "x-ratelimit-limit" for name in header_names)


def test_generation_limit_throttles(limited_client: TestClient) -> None:
    """Bounded at 3/minute in this fixture; the fourth call must be refused.

    These limits bound gateway spend as much as they bound load — an unbounded
    caller here is a billing incident.
    """
    payload = {"language": "en", "headline": "H"}
    statuses = [
        limited_client.post("/api/v1/internal/news/translate", json=payload).status_code
        for _ in range(5)
    ]

    assert statuses[:3] == [200, 200, 200]
    assert 429 in statuses[3:]


def test_throttled_response_is_json_not_html(limited_client: TestClient) -> None:
    payload = {"language": "en", "headline": "H"}
    for _ in range(6):
        response = limited_client.post("/api/v1/internal/news/translate", json=payload)
        if response.status_code == 429:
            assert "Too many requests" in response.json()["detail"]
            return
    pytest.fail("expected a 429 within six calls")
