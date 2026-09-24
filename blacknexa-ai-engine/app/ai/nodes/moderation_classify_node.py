"""Moderation node 2 — one Gemini call.

Sends the §6.3 policy, the framed member content and any photo thumbnails to
`AI_MODERATION_MODEL` and records what came back (INCIDENT_MODULE_PLAN.md §6.2).
Every choice below is a contract with Node's worker:

* **One attempt** (`max_attempts=1`) with `MODERATION_TIMEOUT_SECONDS` (30 s).
  Node owns retries, backoff and the circuit breaker (plan §5.2), and its lease
  is sized against a single attempt; a transport-level retry here would double
  the worst case and could outlive the lease.
* **Temperature 0 and a response schema.** The same content should get the same
  verdict, and the schema makes the provider emit only the allowed literals.
* **`MODERATION_SAFETY_THRESHOLD` (BLOCK_NONE) on all four categories.** At the
  news threshold Gemini refuses exactly the content this call must label.
* **Photos as `inlineData` parts**, in request order, after the text. Gemini
  refuses requests over ~20 MB, so photos are included in order while their
  base64 fits `_INLINE_BUDGET_CHARS`; the rest are left out and
  `imagesAssessed` tells Node how many were seen (it holds the others for a
  moderator — `media_unassessed`).
* **No content in logs** (`log_preview=False`): error bodies can echo the
  request and model output quotes it.

Outcomes, which the finalise node turns into the response:

* `blocked` — `promptFeedback.blockReason`, or a candidate `finishReason` in
  `{SAFETY, PROHIBITED_CONTENT, BLOCKLIST, SPII}`. The reason is returned so Node
  can file the hold under the right category.
* `unavailable` — Gemini unconfigured, not permitted in production
  (`GEMINI_DATA_TERMS=unspecified`), transport failure, no candidate,
  `MAX_TOKENS` or any other unusable finish, or output that is not a JSON object.
* `assessed` — a JSON object came back; its content is not trusted yet.

Every `unavailable` also records whether a retry could help (review R20), because
Node retries it four times and its reconciler re-runs the hold every 10–15
minutes, all billed. Non-retryable, because the same request fails the same way:

* a provider 4xx other than 408 and 429 — a 400 INVALID_ARGUMENT for a thumbnail
  with a valid header but a corrupt body, a 403 for a revoked key;
* the RECITATION, LANGUAGE and MAX_TOKENS finishes — at temperature 0 they
  repeat (a report that pastes an article or lyrics is quoted back verbatim in
  the evidence on every attempt);
* `invalid_json` — the call always sends `RESPONSE_SCHEMA`, so unparseable output
  is either a model that ignores schemas (an operator setting, not an outage) or
  a deterministic answer that will come back the same;
* Gemini unconfigured, or refused by `GEMINI_DATA_TERMS` — configuration, which
  a retry in a few minutes does not change.

Transient: timeouts, 5xx, 408, 429, transport errors, a 2xx with a body that is
not JSON, no candidate, and any other finish reason.
"""

from __future__ import annotations

import re
from typing import Any

from app.ai.moderation_state import ModerationState
from app.ai.prompts.moderation import RESPONSE_SCHEMA, SYSTEM_INSTRUCTION, build_user_prompt
from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.llm import gemini
from app.integrations.llm.chat import chat_completion_result, extract_json_object
from app.integrations.transport import ProviderResult
from app.schemas.moderation import ModerationImage

logger = get_logger(__name__)

_LABEL = "gemini_moderation"

#: Finish reasons that mean "the provider refused this content" (plan §6.1).
_BLOCKED_FINISH_REASONS = frozenset({"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"})

#: Same set `gemini.content_parts` accepts; anything else is unusable.
_OK_FINISH_REASONS = frozenset({"STOP", "FINISH_REASON_STOP", ""})

#: Unusable finishes that repeat on every attempt at temperature 0 (review R20).
#: Any other unusable finish (`OTHER`, an unspecified reason) stays retryable.
_PERMANENT_FINISH_REASONS = frozenset({"RECITATION", "LANGUAGE", "MAX_TOKENS"})

#: 4xx statuses that are about timing, not about the request: worth a retry.
_TRANSIENT_CLIENT_STATUSES = frozenset({408, 429})

#: Eight categories with quotes and translations plus a summary fit in about
#: 2 000 tokens; the headroom covers a model that thinks by default, whose
#: thought tokens count against this limit.
_MAX_OUTPUT_TOKENS = 8192

#: Base64 characters of photo data per request. Gemini rejects requests over
#: about 20 MB in total; ten maximum-size thumbnails would be ~21 MB of base64,
#: and the system instruction plus a 20 000-character report need room too.
_INLINE_BUDGET_CHARS = 18 * 1024 * 1024

#: Provider reason codes are echoed to Node (`block_reason` STRING(64)).
_REASON_CODE = re.compile(r"[^A-Z0-9_]")


def _reason_code(raw: Any) -> str:
    """A provider reason reduced to an upper-case code of at most 64 characters."""
    code = _REASON_CODE.sub("", str(raw or "").upper())[:64]
    return code or "UNSPECIFIED"


def _image_parts(images: list[ModerationImage]) -> list[dict[str, Any]]:
    """`inlineData` parts for as many photos, in order, as fit the budget."""
    parts: list[dict[str, Any]] = []
    used = 0
    for image in images:
        size = len(image.data)
        if used + size > _INLINE_BUDGET_CHARS:
            break
        parts.append({"inlineData": {"mimeType": image.mimeType, "data": image.data}})
        used += size
    return parts


async def run(state: ModerationState) -> ModerationState:
    """Ask the model for a verdict and record the raw outcome on the state."""
    if state.failed:
        return state

    # Configuration failures are outages, not permanent verdicts: no Gemini call
    # is made, so a retry costs nothing, and once ops sets the key or declares the
    # data terms `/ready` reports `moderationReady` and Node's reconciler re-runs
    # the held items by itself (plan D5). Marking them permanent (review R20's
    # first cut) would leave every item held during the misconfiguration waiting
    # for a moderator to press "Re-run AI" one case at a time.
    if not settings.ai_enabled:
        state.mark_unavailable("gemini_unconfigured", retryable=True)
        logger.warning("moderation_unavailable", reason=state.unavailable_reason, retryable=True)
        return state
    if not settings.moderation_permitted:
        # Production refuses to send member content anywhere until the Gemini
        # data terms are declared (plan §13.2).
        state.mark_unavailable("data_terms_unspecified", retryable=True)
        logger.warning("moderation_unavailable", reason=state.unavailable_reason, retryable=True)
        return state

    image_parts = _image_parts(state.images)
    if len(image_parts) < len(state.images):
        logger.warning(
            "moderation_images_over_budget",
            supplied=len(state.images),
            sent=len(image_parts),
        )

    prompt = build_user_prompt(
        target_type=state.target_type,
        category=state.category,
        title=state.title,
        body=state.body,
        location_label=state.location_label,
        parent_title=state.parent_title,
        urgent=state.urgent,
        flagged_categories=state.flagged_categories,
        keyword_signals=state.keyword_signals,
        image_count=len(image_parts),
    )

    result = await chat_completion_result(
        model=settings.moderation_model,
        system=SYSTEM_INSTRUCTION,
        user=prompt,
        temperature=0.0,
        max_tokens=_MAX_OUTPUT_TOKENS,
        json_output=True,
        label=_LABEL,
        response_schema=RESPONSE_SCHEMA,
        safety_threshold=settings.moderation_safety_threshold,
        timeout_seconds=settings.moderation_timeout_seconds,
        extra_parts=image_parts,
        return_blocked=True,
        max_attempts=1,
        log_preview=False,
    )

    _record_outcome(state, result, images_sent=len(image_parts))

    logger.info(
        "moderation_classify_complete",
        status=state.status,
        reason=state.unavailable_reason if state.status == "unavailable" else state.block_reason,
        retryable=state.retryable,
        images_sent=state.images_sent,
        elapsed_ms=state.elapsed_ms,
    )
    return state


def _mark_provider_failure(state: ModerationState, result: ProviderResult) -> None:
    """No body came back: say why, and whether a retry could change it (R20).

    The reason is an operational code built from the status and failure kind —
    never from the provider's error body, which can quote the request back.
    """
    status = result.status
    if result.failure == "timeout":
        state.mark_unavailable("provider_timeout")
    elif result.failure == "http_status" and status is not None:
        permanent = 400 <= status < 500 and status not in _TRANSIENT_CLIENT_STATUSES
        state.mark_unavailable(f"provider_http_{status}", retryable=not permanent)
    elif result.failure == "bad_json":
        # A 2xx whose body is not JSON at all is a provider fault, not the model.
        state.mark_unavailable("provider_bad_response")
    elif result.failure == "unconfigured":
        # Only reachable if the key vanished between the check above and the call.
        state.mark_unavailable("gemini_unconfigured", retryable=True)
    elif result.failure == "transport":
        state.mark_unavailable("provider_transport_error")
    else:
        state.mark_unavailable("provider_unavailable")


def _record_outcome(
    state: ModerationState, result: ProviderResult, *, images_sent: int
) -> None:
    """Classify the Gemini outcome as assessed, blocked or unavailable."""
    body = result.body
    if body is None:
        # Transport failure, a non-2xx, or unconfigured — already logged by the
        # transport with status and error type only.
        _mark_provider_failure(state, result)
        return

    block_reason = (body.get("promptFeedback") or {}).get("blockReason")
    if block_reason:
        state.mark_blocked(_reason_code(block_reason))
        return

    candidate = gemini.first_candidate(body)
    if candidate is None:
        state.mark_unavailable("no_candidate")
        return

    raw_finish = candidate.get("finishReason")
    finish_reason = _reason_code(raw_finish) if raw_finish else ""
    if finish_reason in _BLOCKED_FINISH_REASONS:
        state.mark_blocked(finish_reason)
        return
    if finish_reason not in _OK_FINISH_REASONS:
        # MAX_TOKENS is the common one: half a JSON verdict is no verdict. At
        # temperature 0 it, RECITATION and LANGUAGE come back on every retry.
        state.mark_unavailable(
            f"finish_{finish_reason.lower()}",
            retryable=finish_reason not in _PERMANENT_FINISH_REASONS,
        )
        return

    parsed = extract_json_object(gemini.text_from(body, label=_LABEL), log_preview=False)
    if parsed is None:
        # `RESPONSE_SCHEMA` was sent (always, from this node), so the provider
        # already had every chance to shape the output: not an outage (R20).
        state.mark_unavailable("invalid_json", retryable=False)
        return

    state.mark_assessed(parsed, images_sent=images_sent)
