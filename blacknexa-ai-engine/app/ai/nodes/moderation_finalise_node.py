"""Moderation node 3 — deterministic normalisation and invariants.

Turns whatever the classify node recorded into the §6.1 response. Nothing the
model says is trusted on shape: this verdict decides whether member content
publishes without a human, so every rule below fails towards "a moderator looks
at it" (INCIDENT_MODULE_PLAN.md §6.1–6.2).

Invariants of every response:

* `categories` lists all eight policy codes, once each, in the fixed
  `POLICY_CATEGORIES` order. A code the model skipped is filled in as "no
  violation, confidence 0" — and the skip itself forces `review`.
* Any violated code forces `recommendation = review`. So does any breach of the
  output contract that touches the decision: a missing, unknown or duplicated
  code, a non-boolean `violation`, a non-numeric confidence, an invalid
  recommendation or safety risk. When finalise overrides the model's "approve",
  the model's confidence described an answer that no longer stands, so it is
  reported as 0.
* Confidences are clamped to [0, 1]. Evidence quotes are cut to 200 characters,
  the summary to 600. A non-violated code carries no evidence — quotes are
  member content and are only kept where they support a finding.
* Evidence is mapped back from the escaped form the model saw
  (`unescape_member_text`), because Node accepts an auto-hide only when the quote
  is a verbatim substring of the original content (decision D8). Cutting a quote
  shorter keeps it verbatim.
* `unavailable` and `blocked` answer `review` with confidence 0, all eight codes
  clear, `safetyRisk: none`, language `und` and `imagesAssessed: 0`; `blocked`
  also carries the provider's reason.
* `injectionSuspected` is the prescreen's signal, whatever the status: it is
  known before the model is asked and Node needs it either way.
* `unavailableReason` and `retryable` (review R20) describe an `unavailable`
  answer only: the reason code and whether a retry could change it. Any other
  status answers `unavailableReason: null, retryable: true`.

Only codes, counts and breach names are logged.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, cast, get_args

from app.ai.moderation_state import ModerationState
from app.ai.prompts.moderation import POLICY_VERSION, unescape_member_text
from app.core.config import settings
from app.core.logging import get_logger
from app.core.prompt_safety import sanitise_model_text
from app.schemas.moderation import (
    LEGACY_POLICY_CODES,
    MAX_EVIDENCE_CHARS,
    MAX_SUMMARY_CHARS,
    POLICY_CATEGORIES,
    CategoryAssessment,
    ModerationMeta,
    ModerationResponse,
    PolicyCategory,
    Recommendation,
    SafetyRisk,
    Severity,
)

logger = get_logger(__name__)

_RECOMMENDATIONS: frozenset[str] = frozenset(get_args(Recommendation))
_SAFETY_RISKS: frozenset[str] = frozenset(get_args(SafetyRisk))
_SEVERITIES: frozenset[str] = frozenset(get_args(Severity))

#: A BCP-47-shaped tag, at most 16 characters (Node `ai_language` STRING(16)).
_LANGUAGE_TAG = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$")
_MAX_LANGUAGE_CHARS = 16
#: BCP-47 "undetermined".
_UNDETERMINED = "und"
#: `unavailableReason` is an engine-made code, but `finish_<provider reason>` can
#: run to 71 characters; Node stores it, so it is capped like `blockReason`.
_MAX_UNAVAILABLE_REASON_CHARS = 64

_UNAVAILABLE_SUMMARY = (
    "Automated review was unavailable ({reason}), so no assessment was made. "
    "A moderator must review this content."
)
_BLOCKED_SUMMARY = (
    "The AI provider refused to process this content ({reason}). "
    "A moderator must review it."
)


@dataclass
class Verdict:
    """The model's answer after normalisation."""

    categories: list[CategoryAssessment]
    recommendation: Recommendation
    confidence: float
    safety_risk: SafetyRisk
    summary: str
    language: str
    breaches: list[str] = field(default_factory=list)
    overridden: bool = False


# ── Field normalisers ────────────────────────────────────────────────────────


def _unit_interval(value: Any) -> tuple[float, bool]:
    """`(value clamped to [0, 1], was it a usable number)`."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0, False
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return 0.0, False
    return min(1.0, max(0.0, number)), True


def _model_text(value: Any, max_chars: int) -> str:
    """A model string: hostile characters stripped, escaping reversed, capped."""
    if not isinstance(value, str):
        return ""
    text = unescape_member_text(sanitise_model_text(value))
    return text[:max_chars].rstrip()


def _language(value: Any) -> str:
    if not isinstance(value, str):
        return _UNDETERMINED
    tag = value.strip()
    if len(tag) > _MAX_LANGUAGE_CHARS or not _LANGUAGE_TAG.match(tag):
        return _UNDETERMINED
    primary, _, rest = tag.partition("-")
    return f"{primary.lower()}-{rest}" if rest else primary.lower()


def _clear(code: PolicyCategory) -> CategoryAssessment:
    """A code with no finding."""
    return CategoryAssessment(
        code=code,
        violation=False,
        confidence=0.0,
        severity="low",
        evidence="",
        evidenceEnglish=None,
    )


def _category(code: PolicyCategory, entry: dict[str, Any], breaches: list[str]) -> CategoryAssessment:
    raw_violation = entry.get("violation")
    if isinstance(raw_violation, bool):
        violation = raw_violation
    else:
        # An unreadable finding is not treated as a violation — a violation
        # without a clear reading must never auto-hide anything — but the
        # breach still forces review.
        breaches.append(f"{code}.violation")
        violation = False

    confidence, ok = _unit_interval(entry.get("confidence"))
    if not ok:
        breaches.append(f"{code}.confidence")

    raw_severity = entry.get("severity")
    severity: Severity
    if isinstance(raw_severity, str) and raw_severity in _SEVERITIES:
        severity = cast(Severity, raw_severity)
    else:
        severity = "medium" if violation else "low"

    evidence = _model_text(entry.get("evidence"), MAX_EVIDENCE_CHARS) if violation else ""
    english = (
        _model_text(entry.get("evidenceEnglish"), MAX_EVIDENCE_CHARS) if violation else ""
    )

    return CategoryAssessment(
        code=code,
        violation=violation,
        confidence=confidence,
        severity=severity,
        evidence=evidence,
        evidenceEnglish=english or None,
    )


def _categories(raw: Any, breaches: list[str]) -> list[CategoryAssessment]:
    """All eight codes in fixed order, from whatever the model listed."""
    by_code: dict[str, dict[str, Any]] = {}
    if not isinstance(raw, list):
        breaches.append("categories")
    else:
        for entry in raw:
            if not isinstance(entry, dict):
                breaches.append("categories.item")
                continue
            code = entry.get("code")
            if isinstance(code, str):
                code = LEGACY_POLICY_CODES.get(code, code)
            if code not in POLICY_CATEGORIES:
                breaches.append("categories.unknown_code")
                continue
            if code in by_code:
                breaches.append(f"{code}.duplicate")
                # Two readings of one code: keep the one that found a violation.
                if entry.get("violation") is True and by_code[code].get("violation") is not True:
                    by_code[code] = entry
                continue
            by_code[code] = entry

    assessed: list[CategoryAssessment] = []
    for code in POLICY_CATEGORIES:
        entry = by_code.get(code)
        if entry is None:
            breaches.append(f"{code}.missing")
            assessed.append(_clear(code))
        else:
            assessed.append(_category(code, entry, breaches))
    return assessed


def normalise_output(raw: dict[str, Any]) -> Verdict:
    """Apply every invariant to one parsed model answer."""
    breaches: list[str] = []
    categories = _categories(raw.get("categories"), breaches)

    raw_recommendation = raw.get("recommendation")
    model_recommendation: Recommendation
    if isinstance(raw_recommendation, str) and raw_recommendation in _RECOMMENDATIONS:
        model_recommendation = cast(Recommendation, raw_recommendation)
    else:
        breaches.append("recommendation")
        model_recommendation = "review"

    confidence, ok = _unit_interval(raw.get("confidence"))
    if not ok:
        breaches.append("confidence")

    raw_risk = raw.get("safetyRisk")
    safety_risk: SafetyRisk
    if isinstance(raw_risk, str) and raw_risk in _SAFETY_RISKS:
        safety_risk = cast(SafetyRisk, raw_risk)
    else:
        breaches.append("safetyRisk")
        safety_risk = "none"

    any_violation = any(category.violation for category in categories)
    recommendation: Recommendation = (
        "review" if any_violation or breaches or model_recommendation == "review" else "approve"
    )
    overridden = model_recommendation == "approve" and recommendation == "review"
    if overridden or "recommendation" in breaches:
        confidence = 0.0

    return Verdict(
        categories=categories,
        recommendation=recommendation,
        confidence=confidence,
        safety_risk=safety_risk,
        summary=_model_text(raw.get("summary"), MAX_SUMMARY_CHARS),
        language=_language(raw.get("language")),
        breaches=breaches,
        overridden=overridden,
    )


# ── Response ─────────────────────────────────────────────────────────────────


def build_response(state: ModerationState) -> ModerationResponse:
    """The §6.1 response for the state as it stands."""
    if state.status == "assessed" and state.raw_output is None:
        state.mark_unavailable("missing_output")

    meta = ModerationMeta(
        runId=state.request_run_id,
        model=settings.moderation_model,
        policyVersion=POLICY_VERSION,
        durationMs=state.elapsed_ms,
    )

    if state.status == "assessed" and state.raw_output is not None:
        verdict = normalise_output(state.raw_output)
        state.notes["breaches"] = verdict.breaches
        state.notes["overridden"] = verdict.overridden
        return ModerationResponse(
            status="assessed",
            recommendation=verdict.recommendation,
            confidence=verdict.confidence,
            categories=verdict.categories,
            safetyRisk=verdict.safety_risk,
            summary=verdict.summary,
            injectionSuspected=state.injection_suspected,
            blockReason=None,
            language=verdict.language,
            imagesAssessed=state.images_sent,
            retryable=True,
            unavailableReason=None,
            meta=meta,
        )

    unavailable_reason: str | None = None
    retryable = True
    if state.status == "blocked":
        reason = state.block_reason or "UNSPECIFIED"
        summary = _BLOCKED_SUMMARY.format(reason=reason)
        block_reason: str | None = reason
    else:
        summary = _UNAVAILABLE_SUMMARY.format(reason=state.unavailable_reason)
        block_reason = None
        unavailable_reason = state.unavailable_reason[:_MAX_UNAVAILABLE_REASON_CHARS]
        retryable = state.retryable

    return ModerationResponse(
        status=state.status,
        recommendation="review",
        confidence=0.0,
        categories=[_clear(code) for code in POLICY_CATEGORIES],
        safetyRisk="none",
        summary=summary[:MAX_SUMMARY_CHARS],
        injectionSuspected=state.injection_suspected,
        blockReason=block_reason,
        language=_UNDETERMINED,
        imagesAssessed=0,
        retryable=retryable,
        unavailableReason=unavailable_reason,
        meta=meta,
    )


async def run(state: ModerationState) -> ModerationState:
    """Populate `state.response`."""
    if state.failed:
        return state

    state.response = build_response(state)
    response = state.response
    logger.info(
        "moderation_finalised",
        status=response.status,
        recommendation=response.recommendation,
        violations=[c.code for c in response.categories if c.violation],
        safety_risk=response.safetyRisk,
        injection_suspected=response.injectionSuspected,
        breaches=list(state.notes.get("breaches", [])),
        overridden=bool(state.notes.get("overridden", False)),
        images_assessed=response.imagesAssessed,
        retryable=response.retryable,
    )
    return state
