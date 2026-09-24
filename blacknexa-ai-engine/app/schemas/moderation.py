"""Request/response models for content moderation.

The wire contract of `POST /api/v1/internal/moderation/assess`, exactly as
INCIDENT_MODULE_PLAN.md §6.1 fixes it. Node's `aiEngineClient.assessModeration()`
is written against these shapes, so every field name, cap and literal here is part
of a cross-language contract that no type checker sees: change one only together
with the Node client.

Conventions shared with `schemas.news`:

* **camelCase on the wire** — the Python field names *are* the wire names.
* `extra="forbid"` on requests — the mass-assignment guard; an unknown field is a
  422, never silently dropped.
* Literal unions mirror the Node types (`types/moderation.interface.ts`,
  `types/report.interface.ts`) value for value.

Validation errors are returned without the rejected value (see `core.errors`), so
every custom validator below raises a message that names the rule, never the input.

Images are checked here rather than in the pipeline because a bad image is a
caller bug, not an assessment outcome: allowed mime type, strict base64, at most
`MODERATION_MAX_IMAGE_BYTES` once decoded, at most `MODERATION_MAX_IMAGES` of them.
Any violation is a 422, which Node treats as a permanent error and holds for a
human — never a retry storm.
"""

from __future__ import annotations

import base64
import binascii
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings

# ── Vocabulary ───────────────────────────────────────────────────────────────

#: The one policy taxonomy (plan §3.1, decision D6): AI output, keyword rules,
#: user flags, reject reasons and admin tabs all use these eight codes.
PolicyCategory = Literal[
    "threat",
    "harassment",
    "hate",
    "private_info",
    "misleading",
    "spam",
    "graphic",
    "other",
]

#: The fixed order every response lists the categories in. Node and the admin
#: console render rows in this order; a model that shuffles them changes nothing.
POLICY_CATEGORIES: tuple[PolicyCategory, ...] = (
    "threat",
    "harassment",
    "hate",
    "private_info",
    "misleading",
    "spam",
    "graphic",
    "other",
)

#: Flag reasons the current mobile client still sends (plan §3.1). Node
#: normalises before calling, but the engine accepts them too, so a missed
#: normalisation is a correct assessment rather than a 422 and a held report.
LEGACY_POLICY_CODES: dict[str, PolicyCategory] = {
    "threatening": "threat",
    "private_details": "private_info",
    "untrue": "misleading",
}

#: Mirrors the Node `ReportCategory` union: what happened to the author. It is
#: context for the model, never a policy code.
ReportCategory = Literal[
    "policing",
    "profiling",
    "housing",
    "workplace",
    "education",
    "medical",
    "digital",
    "harassment",
    "other",
]

TargetType = Literal["report", "comment"]

#: `assessed` — the model answered and the answer was normalised.
#: `unavailable` — no usable answer (unconfigured, not permitted, transport
#: failure, invalid JSON, MAX_TOKENS). `retryable` says whether Node should
#: retry (review R20); either way a report is held once Node stops.
#: `blocked` — Gemini refused the content itself. Node holds it for a human.
ModerationStatus = Literal["assessed", "unavailable", "blocked"]

#: The AI never rejects (decision D4): it clears content or sends it to a human.
Recommendation = Literal["approve", "review"]

Severity = Literal["low", "medium", "high"]

#: Decision D21. Separate from the categories: a safety risk is not a violation.
SafetyRisk = Literal["none", "self_harm", "imminent_danger"]

#: The formats Gemini reads inline and Node produces for thumbnails.
ImageMimeType = Literal["image/jpeg", "image/png", "image/webp"]

#: Hard contract caps (plan §6.1). Settings may tighten the image ones only.
MAX_TITLE_CHARS = 200
MAX_BODY_CHARS = 20_000
MAX_FLAGGED_CATEGORIES = 8
MAX_KEYWORD_SIGNALS = 20
MAX_IMAGES = 10
#: Response caps.
MAX_EVIDENCE_CHARS = 200
MAX_SUMMARY_CHARS = 600

#: A 32-hex run id (Node strips the dashes), or the canonical dashed UUID.
_RUN_ID_PATTERN = (
    r"^(?:[0-9a-fA-F]{32}"
    r"|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
)


def _normalise_legacy_code(value: Any) -> Any:
    """Map a legacy flag code onto its policy code; leave anything else alone."""
    if isinstance(value, str):
        return LEGACY_POLICY_CODES.get(value, value)
    return value


def _encoded_length(decoded_bytes: int) -> int:
    """Length of the padded base64 encoding of `decoded_bytes` bytes."""
    return 4 * ((decoded_bytes + 2) // 3)


# ── Bases ────────────────────────────────────────────────────────────────────
#
# Private copies of the bases in `schemas.news`, deliberately not imported from
# there: the two contracts evolve independently, and a shared base would let a
# news change alter the moderation wire format without anyone noticing.


class _Wire(BaseModel):
    """Base for models crossing the service boundary."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class _Response(BaseModel):
    """Base for responses — permissive on input, camelCase on output."""

    model_config = ConfigDict(populate_by_name=True)


# ── Request ──────────────────────────────────────────────────────────────────


class KeywordSignal(_Wire):
    """A keyword-rule hit Node's matcher found (plan D9, `action: signal`).

    A hint about which code to examine closely, never evidence. `term` is the
    rule term that matched; rule terms are 2–80 characters (plan §4.5), and the
    extra room here is for built-in detector labels.
    """

    category: PolicyCategory
    term: Annotated[str, Field(min_length=1, max_length=100)]

    @field_validator("category", mode="before")
    @classmethod
    def _accept_legacy_category(cls, value: Any) -> Any:
        return _normalise_legacy_code(value)


class ModerationImage(_Wire):
    """One photo thumbnail, sent inline to Gemini (plan D22)."""

    mimeType: ImageMimeType
    data: Annotated[str, Field(min_length=4)]

    @field_validator("data")
    @classmethod
    def _valid_base64_within_cap(cls, value: str) -> str:
        cap = settings.moderation_max_image_bytes
        # Cheap length check first, so an oversized payload is refused before a
        # single byte of it is decoded.
        if len(value) > _encoded_length(cap):
            raise ValueError(f"image exceeds the {cap}-byte limit")
        try:
            decoded = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("image data must be valid base64") from None
        if not decoded:
            raise ValueError("image data must not be empty")
        if len(decoded) > cap:
            raise ValueError(f"image exceeds the {cap}-byte limit")
        return value


class ModerationRequest(_Wire):
    """What Node sends for one run (plan §6.1).

    Private reports never arrive here (decision D3): Node's `needsModeration`
    guard stops them before the call. Flagged re-checks carry only the *set* of
    flagged categories — never flag notes or counts (decision D8).
    """

    runId: Annotated[str, Field(pattern=_RUN_ID_PATTERN)]
    targetType: TargetType
    category: ReportCategory | None = None
    title: Annotated[str, Field(max_length=MAX_TITLE_CHARS)] | None = None
    body: Annotated[str, Field(min_length=1, max_length=MAX_BODY_CHARS)]
    locationLabel: Annotated[str, Field(max_length=MAX_TITLE_CHARS)] | None = None
    #: Comments only: the title of the report the comment is on.
    parentTitle: Annotated[str, Field(max_length=MAX_TITLE_CHARS)] | None = None
    urgent: bool = False
    flaggedCategories: list[PolicyCategory] = Field(
        default_factory=list, max_length=MAX_FLAGGED_CATEGORIES
    )
    keywordSignals: list[KeywordSignal] = Field(
        default_factory=list, max_length=MAX_KEYWORD_SIGNALS
    )
    images: list[ModerationImage] = Field(default_factory=list, max_length=MAX_IMAGES)

    @field_validator("flaggedCategories", mode="before")
    @classmethod
    def _accept_legacy_flags(cls, value: Any) -> Any:
        if isinstance(value, list):
            return [_normalise_legacy_code(item) for item in value]
        return value

    @field_validator("flaggedCategories")
    @classmethod
    def _dedupe_flags(cls, value: list[PolicyCategory]) -> list[PolicyCategory]:
        # After the cap: the cap bounds what the caller sent, dedupe tidies it.
        return list(dict.fromkeys(value))

    @field_validator("images")
    @classmethod
    def _within_image_limit(cls, value: list[ModerationImage]) -> list[ModerationImage]:
        limit = settings.moderation_max_images
        if len(value) > limit:
            raise ValueError(f"at most {limit} images are accepted")
        return value

    @property
    def log_run_id(self) -> str:
        """The run id as logs and the run log carry it: 32 hex, no dashes."""
        return self.runId.replace("-", "").lower()[:32]


# ── Response ─────────────────────────────────────────────────────────────────


class CategoryAssessment(_Response):
    """One policy code, always present, always in `POLICY_CATEGORIES` order.

    `evidence` is a quote (≤200 characters) copied from the content when
    `violation` is true, and `""` otherwise. Node checks it is a verbatim
    substring before any auto-hide (decision D8), so it is never paraphrased here.
    """

    code: PolicyCategory
    violation: bool
    confidence: float
    severity: Severity
    evidence: str = ""
    evidenceEnglish: str | None = None


class ModerationMeta(_Response):
    """Observability for one assessment. No content."""

    runId: str
    model: str
    policyVersion: str
    durationMs: int = 0


class ModerationResponse(_Response):
    """The verdict — always a 200 for a valid request (plan §6.1).

    `imagesAssessed` counts the photos the model actually saw: the first N of the
    request's `images`, in order. It is 0 unless `status` is `assessed`.
    `language` is a BCP-47 code, `und` when it could not be determined.

    `retryable` and `unavailableReason` extend §6.1 (review R20) and are only
    meaningful when `status` is `unavailable`:

    * `unavailableReason` — an operational code (`provider_timeout`,
      `provider_http_400`, `finish_recitation`, `invalid_json`,
      `gemini_unconfigured`, …) of at most 64 characters, never member
      content; null otherwise.
    * `retryable` — false when the same request would fail the same way: a
      provider 4xx other than 408/429, a RECITATION / LANGUAGE / MAX_TOKENS
      finish, unparseable output despite the response schema, or a Gemini that is
      unconfigured or not permitted. True for timeouts, 5xx, 408, 429 and
      transport errors. It is always true for `assessed` and `blocked`, so a
      client that reads it without checking `status` never treats a verdict as a
      permanent failure.
    """

    status: ModerationStatus
    recommendation: Recommendation
    confidence: float
    categories: list[CategoryAssessment]
    safetyRisk: SafetyRisk
    summary: str
    injectionSuspected: bool
    blockReason: str | None = None
    language: str
    imagesAssessed: int = 0
    retryable: bool = True
    unavailableReason: str | None = None
    meta: ModerationMeta
