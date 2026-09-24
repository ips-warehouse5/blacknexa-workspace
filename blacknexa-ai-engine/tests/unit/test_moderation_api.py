"""The moderation route: auth, validation without input echo, and the contract.

`POST /api/v1/internal/moderation/assess` is called by Node's moderation worker,
which is written against INCIDENT_MODULE_PLAN.md §6.1 field for field. These tests
pin that shape — key sets, the fixed category order, the always-200 rule — because
a rename here holds or publishes reports in production and no type checker spans
the language boundary.

The 401 check lives in `test_api.py` (`PROTECTED`), with every other route.

`retryable` and `unavailableReason` extend the §6.1 response (review R20): Node
uses them to stop retrying, and re-running from its reconciler, a failure that
repeats on every attempt. Their camelCase wire names are pinned here.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import settings
from app.schemas.moderation import POLICY_CATEGORIES
from tests.support import (
    MODERATION_RUN_ID,
    MODERATION_URL,
    gemini_moderation,
    moderation_image,
    moderation_output,
    moderation_request,
)

ASSESS = "/api/v1/internal/moderation/assess"

#: A string that must never come back out of a 422 or reach a log line.
MARKER = "SECRET-MEMBER-TEXT-7f3a"

RESPONSE_KEYS = {
    "status",
    "recommendation",
    "confidence",
    "categories",
    "safetyRisk",
    "summary",
    "injectionSuspected",
    "blockReason",
    "language",
    "imagesAssessed",
    "retryable",
    "unavailableReason",
    "meta",
}
CATEGORY_KEYS = {"code", "violation", "confidence", "severity", "evidence", "evidenceEnglish"}
META_KEYS = {"runId", "model", "policyVersion", "durationMs"}


class _RecordingLogger:
    """Stands in for a module's structlog logger and keeps every call."""

    def __init__(self) -> None:
        self.events: list[tuple[str, str, dict[str, Any]]] = []

    def __getattr__(self, level: str) -> Any:
        def _log(event: str, *args: Any, **kwargs: Any) -> None:
            self.events.append((level, event, kwargs))

        return _log

    def dump(self) -> str:
        return json.dumps([list(e) for e in self.events], default=str)


# ── Authentication ───────────────────────────────────────────────────────────


def test_assess_requires_a_token(client: TestClient) -> None:
    assert client.post(ASSESS, json=moderation_request()).status_code == 401


# ── Validation: 422, and never an echo of the input ──────────────────────────


def _assert_no_echo(response: httpx.Response) -> None:
    assert response.status_code == 422, response.text
    assert MARKER not in response.text
    for error in response.json()["errors"]:
        assert "input" not in error
        assert "ctx" not in error


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"internalOverride": MARKER}, id="unknown-field"),
        pytest.param({"body": MARKER * 2000}, id="body-over-20000"),
        pytest.param({"body": ""}, id="empty-body"),
        pytest.param({"title": MARKER * 20}, id="title-over-200"),
        pytest.param({"targetType": MARKER}, id="bad-target-type"),
        pytest.param({"category": MARKER}, id="bad-report-category"),
        pytest.param({"runId": MARKER}, id="bad-run-id"),
        pytest.param({"flaggedCategories": [MARKER]}, id="bad-flag-code"),
        pytest.param({"flaggedCategories": ["threat"] * 9}, id="more-than-8-flags"),
        pytest.param(
            {"keywordSignals": [{"category": "threat", "term": "t"}] * 21}, id="more-than-20-signals"
        ),
        pytest.param(
            {"keywordSignals": [{"category": "threat", "term": "t", "note": MARKER}]},
            id="unknown-signal-field",
        ),
        pytest.param({"images": [moderation_image()] * 11}, id="more-than-10-images"),
        pytest.param(
            {"images": [moderation_image(mime_type="image/gif")]}, id="disallowed-mime"
        ),
        pytest.param(
            {"images": [{"mimeType": "image/jpeg", "data": f"{MARKER}!!!"}]}, id="not-base64"
        ),
    ],
)
def test_invalid_requests_are_422_without_echoing_input(
    auth_client: TestClient, overrides: dict[str, Any]
) -> None:
    _assert_no_echo(auth_client.post(ASSESS, json=moderation_request(**overrides)))


def test_malformed_json_is_422_without_echo(auth_client: TestClient) -> None:
    response = auth_client.post(
        ASSESS,
        content=f'{{"body": "{MARKER}", '.encode(),
        headers={"Content-Type": "application/json"},
    )
    _assert_no_echo(response)


def test_oversized_image_is_422(auth_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """`MODERATION_MAX_IMAGE_BYTES` is checked on the decoded size."""
    monkeypatch.setattr(settings, "moderation_max_image_bytes", 1024)
    image = moderation_image(payload=b"x" * 1025)
    _assert_no_echo(auth_client.post(ASSESS, json=moderation_request(images=[image])))

    # Exactly at the cap is accepted by validation.
    with respx.mock:
        respx.post(MODERATION_URL).mock(
            return_value=httpx.Response(200, json=gemini_moderation(moderation_output()))
        )
        ok = auth_client.post(
            ASSESS, json=moderation_request(images=[moderation_image(payload=b"x" * 1024)])
        )
    assert ok.status_code == 200


def test_image_count_setting_tightens_the_contract_cap(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "moderation_max_images", 1)
    images = [moderation_image(), moderation_image()]
    _assert_no_echo(auth_client.post(ASSESS, json=moderation_request(images=images)))


def test_validation_log_carries_no_input(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Stripped in the log as well as the response — globally, not per route."""
    import app.core.errors as errors_module

    recorder = _RecordingLogger()
    monkeypatch.setattr(errors_module, "logger", recorder)

    auth_client.post(ASSESS, json=moderation_request(body=MARKER * 2000, extra=MARKER))

    assert any(event == "request_validation_failed" for _, event, _ in recorder.events)
    assert MARKER not in recorder.dump()


def test_news_routes_also_stop_echoing_input(auth_client: TestClient) -> None:
    """The stripping is global (plan §6.1), so the news routes lose the echo too."""
    response = auth_client.post(
        "/api/v1/internal/news/synthesize", json={"topicPrompt": "ok", "category": MARKER}
    )
    _assert_no_echo(response)


def test_legacy_flag_codes_are_accepted(auth_client: TestClient) -> None:
    """The current mobile client's flag codes still validate (plan §3.1)."""
    with respx.mock:
        route = respx.post(MODERATION_URL).mock(
            return_value=httpx.Response(200, json=gemini_moderation(moderation_output()))
        )
        response = auth_client.post(
            ASSESS,
            json=moderation_request(
                flaggedCategories=["threatening", "private_details", "untrue", "threat"],
                keywordSignals=[{"category": "threatening", "term": "burn it down"}],
            ),
        )
    assert response.status_code == 200, response.text
    prompt = json.loads(route.calls.last.request.content)["contents"][0]["parts"][0]["text"]
    assert "flaggedCategories: threat, private_info, misleading\n" in prompt
    assert '- threat: "burn it down"' in prompt


def test_dashed_run_id_is_accepted_and_echoed(auth_client: TestClient) -> None:
    run_id = "01234567-89ab-cdef-0123-456789abcdef"
    with respx.mock:
        respx.post(MODERATION_URL).mock(
            return_value=httpx.Response(200, json=gemini_moderation(moderation_output()))
        )
        body = auth_client.post(ASSESS, json=moderation_request(runId=run_id)).json()
    assert body["meta"]["runId"] == run_id


def test_optional_fields_may_be_omitted(auth_client: TestClient) -> None:
    """Only runId, targetType and body are required — a bare comment is valid."""
    with respx.mock:
        respx.post(MODERATION_URL).mock(
            return_value=httpx.Response(200, json=gemini_moderation(moderation_output()))
        )
        response = auth_client.post(
            ASSESS,
            json={"runId": MODERATION_RUN_ID, "targetType": "comment", "body": "So sorry this happened."},
        )
    assert response.status_code == 200, response.text


# ── Response contract ────────────────────────────────────────────────────────


def _assert_contract(body: dict[str, Any]) -> None:
    assert set(body) == RESPONSE_KEYS
    assert [c["code"] for c in body["categories"]] == list(POLICY_CATEGORIES)
    for category in body["categories"]:
        assert set(category) == CATEGORY_KEYS
    assert set(body["meta"]) == META_KEYS
    assert body["meta"]["runId"] == MODERATION_RUN_ID
    assert body["meta"]["model"] == settings.moderation_model
    assert body["meta"]["policyVersion"]
    assert isinstance(body["meta"]["durationMs"], int)


@respx.mock
def test_assessed_contract(auth_client: TestClient) -> None:
    respx.post(MODERATION_URL).mock(
        return_value=httpx.Response(200, json=gemini_moderation(moderation_output()))
    )
    response = auth_client.post(ASSESS, json=moderation_request(images=[moderation_image()]))

    assert response.status_code == 200
    body = response.json()
    _assert_contract(body)
    assert body["status"] == "assessed"
    assert body["recommendation"] == "approve"
    assert body["confidence"] == pytest.approx(0.95)
    assert body["safetyRisk"] == "none"
    assert body["blockReason"] is None
    assert body["injectionSuspected"] is False
    assert body["language"] == "en"
    assert body["imagesAssessed"] == 1
    assert body["retryable"] is True
    assert body["unavailableReason"] is None


@respx.mock
def test_provider_failure_is_still_a_200(auth_client: TestClient) -> None:
    """Always 200 for a valid request: Node reads `status`, not the HTTP code."""
    respx.post(MODERATION_URL).mock(return_value=httpx.Response(503, json={"error": "down"}))
    response = auth_client.post(ASSESS, json=moderation_request())

    assert response.status_code == 200
    body = response.json()
    _assert_contract(body)
    assert body["status"] == "unavailable"
    assert body["recommendation"] == "review"
    assert body["confidence"] == 0.0
    assert body["imagesAssessed"] == 0
    assert body["language"] == "und"
    assert body["retryable"] is True
    assert body["unavailableReason"] == "provider_http_503"


@respx.mock
def test_permanent_provider_failure_is_not_retryable(auth_client: TestClient) -> None:
    """A 400 (e.g. a corrupt thumbnail) repeats on every attempt — review R20."""
    respx.post(MODERATION_URL).mock(
        return_value=httpx.Response(400, json={"error": {"status": "INVALID_ARGUMENT"}})
    )
    response = auth_client.post(ASSESS, json=moderation_request(images=[moderation_image()]))

    assert response.status_code == 200
    body = response.json()
    _assert_contract(body)
    assert body["status"] == "unavailable"
    assert body["retryable"] is False
    assert body["unavailableReason"] == "provider_http_400"


@respx.mock
def test_blocked_is_a_200_with_the_reason(auth_client: TestClient) -> None:
    respx.post(MODERATION_URL).mock(
        return_value=httpx.Response(200, json={"promptFeedback": {"blockReason": "PROHIBITED_CONTENT"}})
    )
    body = auth_client.post(ASSESS, json=moderation_request()).json()
    _assert_contract(body)
    assert body["status"] == "blocked"
    assert body["blockReason"] == "PROHIBITED_CONTENT"
    assert body["recommendation"] == "review"
    assert body["retryable"] is True
    assert body["unavailableReason"] is None


def test_unexpected_error_is_answered_unavailable(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A bug in the pipeline must not turn into a 500 Node cannot read."""
    import app.ai.nodes.moderation_classify_node as classify_node

    async def _explode(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError(MARKER)

    monkeypatch.setattr(classify_node, "chat_completion_result", _explode)
    response = auth_client.post(ASSESS, json=moderation_request())

    assert response.status_code == 200
    body = response.json()
    _assert_contract(body)
    assert body["status"] == "unavailable"
    assert body["unavailableReason"] == "internal_error"
    assert body["retryable"] is True
    assert MARKER not in response.text


def test_run_log_row_is_still_written_through_the_route(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The write moved to a background task (review R19); it must still happen once."""
    from app.services import moderation_service

    calls: list[dict[str, Any]] = []

    async def _record(**kwargs: Any) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(moderation_service, "record_operation", _record)
    with respx.mock:
        respx.post(MODERATION_URL).mock(
            return_value=httpx.Response(200, json=gemini_moderation(moderation_output()))
        )
        response = auth_client.post(ASSESS, json=moderation_request())

    assert response.status_code == 200
    assert [(c["operation"], c["outcome"], c["caller"]) for c in calls] == [
        ("moderate", "approve", "test-suite")
    ]


# ── Readiness ────────────────────────────────────────────────────────────────


def test_ready_reports_moderation_without_changing_ready(client: TestClient) -> None:
    body = client.get("/ready").json()
    assert body["ready"] is True
    assert body["moderationReady"] is True


def test_production_without_data_terms_is_not_moderation_ready(
    client: TestClient, auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Plan §13.2: no member content leaves until the Gemini terms are declared."""
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "gemini_data_terms", "unspecified")

    body = client.get("/ready").json()
    assert body["moderationReady"] is False
    assert body["ready"] is True  # news readiness is unaffected

    with respx.mock:
        route = respx.post(MODERATION_URL).mock(return_value=httpx.Response(200, json={}))
        verdict = auth_client.post(ASSESS, json=moderation_request()).json()
    assert not route.called
    assert verdict["status"] == "unavailable"
    # Configuration behaves as an outage: no Gemini call is made, and Node's
    # reconciler re-runs held items once moderationReady turns true (plan D5).
    assert verdict["retryable"] is True
    assert verdict["unavailableReason"] == "data_terms_unspecified"

    monkeypatch.setattr(settings, "gemini_data_terms", "paid")
    assert client.get("/ready").json()["moderationReady"] is True
