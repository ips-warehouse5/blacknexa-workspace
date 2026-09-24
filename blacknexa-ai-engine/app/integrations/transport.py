"""Shared outbound HTTP transport.

Ports `fetchWithRetry` / `fetchWithTimeout` from `blacknexa-backend/src/utils/http.util.ts`:
a bounded timeout plus one retry absorbs the transient 5xx responses that occur
between the edge and a provider's origin, so a briefing request fails fast instead
of hanging.

Provider-agnostic by design. It used to point at a single aggregating gateway;
now that Gemini and Exa are called directly, callers pass an absolute URL and
their own auth header, and this module owns only the connection pool and the
retry policy. Nothing here knows an API key.

Two deliberate differences from the Node original, both fixes rather than changes
of behaviour:

* **Every call retries.** In Node, synthesis used `fetchWithRetry` but image
  generation and TTS used the single-shot `fetchWithTimeout`. A transient 5xx on
  the image call therefore dropped the article's unique image silently and left
  the curated fallback in place. The retry policy is applied uniformly here.
* **One pooled client.** Node created a fresh connection per call. A shared
  `httpx.AsyncClient` keeps connections warm, which matters when the daily batch
  fires 30 syntheses plus 30 image calls in parallel.

Failure contract is unchanged and load-bearing: every method returns `None`
rather than raising, because the whole feed is built to degrade around a missing
AI result. A caller that needs an error instead raises it itself.

`log_preview=False` exists for content moderation (INCIDENT_MODULE_PLAN.md §6.2),
whose requests carry member reports and photos. A provider error body can quote
the request back (Gemini's 400s name the offending field and value), and a 200
that fails to parse is model output full of evidence quotes — so on that path the
failure is logged by status and type only, never with a body preview.

`post_json_result` is the same call with the failure described instead of
collapsed to `None` (review R20). Moderation has to tell Node whether an
`unavailable` answer is worth retrying: a timeout, a 5xx, a 408 or a 429 may
succeed next time, but a 400 for a corrupt thumbnail repeats on every attempt,
and Node was retrying those four times and then re-running them from its
reconciler forever. `post_json` is now a thin wrapper that returns only the body,
so every existing caller sees exactly the old behaviour — the retry rule
included (a 408 is still not retried here; moderation makes one attempt anyway).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: httpx.AsyncClient | None = None


def _build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(settings.ai_timeout_seconds),
        limits=httpx.Limits(max_connections=64, max_keepalive_connections=32),
        headers={"User-Agent": "blacknexa-ai-engine/1.0"},
        # Both providers are known hosts; never chase a redirect to somewhere
        # else, because the redirect target would receive the API key.
        follow_redirects=False,
    )


async def get_client() -> httpx.AsyncClient:
    """The shared pooled client, created on first use."""
    global _client
    if _client is None or _client.is_closed:
        _client = _build_client()
    return _client


async def close_client() -> None:
    """Release the pool during shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


#: Why a call produced no body. `unconfigured` and `blocked` are set by the
#: Gemini client above this module, never by the transport itself.
ProviderFailure = Literal["timeout", "transport", "http_status", "bad_json", "unconfigured", "blocked"]


@dataclass(frozen=True)
class ProviderResult:
    """The outcome of one provider call, success or not.

    `status` is the HTTP status of the *last* attempt's response — None when that
    attempt got no response at all (timeout, connection error). `failure` is None
    exactly when `body` is not None.
    """

    body: dict[str, Any] | None
    status: int | None = None
    failure: ProviderFailure | None = None


async def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    label: str,
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    max_attempts: int | None = None,
    log_preview: bool = True,
) -> dict[str, Any] | None:
    """POST JSON, retrying once on a non-OK status or a transport error.

    `label` is what appears in the logs — a stable name for the call site, not the
    URL, so a rotated key or a changed base URL never widens what gets logged.
    `log_preview=False` drops the response-body preview from those logs.

    Returns the decoded body, or `None` on definitive failure. `None` is the
    contract every caller in this service is written against.
    """
    result = await post_json_result(
        url,
        payload,
        label=label,
        headers=headers,
        timeout_seconds=timeout_seconds,
        max_attempts=max_attempts,
        log_preview=log_preview,
    )
    return result.body


async def post_json_result(
    url: str,
    payload: dict[str, Any],
    *,
    label: str,
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    max_attempts: int | None = None,
    log_preview: bool = True,
) -> ProviderResult:
    """`post_json`, but saying *why* there is no body (review R20).

    Same requests, same retries, same log lines; only the return value differs.
    """
    attempts = max_attempts if max_attempts is not None else settings.ai_max_attempts
    timeout = timeout_seconds if timeout_seconds is not None else settings.ai_timeout_seconds
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    client = await get_client()

    # `last_status` keeps its old meaning for the exhaustion log line (the last
    # non-OK status seen); `status`/`failure` describe the last attempt only.
    last_status: int | None = None
    status: int | None = None
    failure: ProviderFailure = "transport"

    for attempt in range(1, attempts + 1):
        try:
            response = await client.post(
                url,
                json=payload,
                headers=request_headers,
                timeout=timeout,
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            status = None
            failure = "timeout" if isinstance(exc, httpx.TimeoutException) else "transport"
            logger.warning(
                "provider_request_failed",
                call=label,
                attempt=attempt,
                error_type=type(exc).__name__,
                error=str(exc),
            )
        else:
            status = response.status_code
            if response.is_success:
                try:
                    return ProviderResult(body=response.json(), status=status)
                except ValueError:
                    # A 200 with an unparseable body is a provider fault; a retry
                    # is worth one shot before giving up.
                    failure = "bad_json"
                    logger.warning(
                        "provider_bad_json",
                        call=label,
                        attempt=attempt,
                        **_preview(response, enabled=log_preview),
                    )
            else:
                last_status = response.status_code
                failure = "http_status"
                # The body is logged, never returned — provider errors can echo
                # request content back.
                logger.warning(
                    "provider_non_ok",
                    call=label,
                    attempt=attempt,
                    status=response.status_code,
                    **_preview(response, enabled=log_preview),
                )
                # 4xx other than 429 will not improve on retry.
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    return ProviderResult(body=None, status=status, failure=failure)

        if attempt < attempts:
            await asyncio.sleep(settings.ai_retry_delay_seconds)

    logger.error("provider_exhausted", call=label, attempts=attempts, last_status=last_status)
    return ProviderResult(body=None, status=status, failure=failure)


def _preview(response: httpx.Response, *, enabled: bool) -> dict[str, str]:
    """The `body_preview` log field, or nothing when previews are off."""
    return {"body_preview": response.text[:200]} if enabled else {}
