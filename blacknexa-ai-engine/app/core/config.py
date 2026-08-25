"""Environment configuration with fail-fast validation.

Mirrors the Node service's `env.config.ts`: everything the engine needs is declared
in one settings model and validated before anything boots. A missing or malformed
value aborts startup with a readable list rather than surfacing later as a runtime
failure or, worse, a silently insecure default.

No secret has a usable default. `GEMINI_API_KEY`, `EXA_API_KEY` and
`SERVICE_JWT_SECRET` must be supplied.

The engine talks to two providers directly — Google's Generative Language API for
every model call, and Exa for web search. There is no aggregating gateway in
between, so each provider is keyed, validated and reported on independently.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from typing import Literal

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "production"]


class Settings(BaseSettings):
    """Validated runtime configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Runtime ──────────────────────────────────────────────────────────────
    environment: Environment = Field(default="development", alias="ENVIRONMENT")
    host: str = Field(default="0.0.0.0", alias="HOST")  # noqa: S104
    port: int = Field(default=8100, ge=1, le=65535, alias="PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_json: bool = Field(default=False, alias="LOG_JSON")

    # ── Gemini (Google Generative Language API) ──────────────────────────────
    # Every model call — synthesis, imagery, TTS, translation — goes here.
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        alias="GEMINI_BASE_URL",
    )

    # ── Exa (web search) ─────────────────────────────────────────────────────
    # Grounding is the one capability Gemini cannot supply in the shape this
    # pipeline needs — real publisher URLs with dated highlight excerpts — so Exa
    # is called directly with its own key.
    exa_api_key: str = Field(default="", alias="EXA_API_KEY")
    exa_base_url: str = Field(default="https://api.exa.ai", alias="EXA_BASE_URL")

    # Transport tuning, ported verbatim from ai_gateway.service.ts / http.util.ts.
    ai_timeout_seconds: float = Field(default=20.0, gt=0, alias="AI_TIMEOUT_SECONDS")
    ai_retry_delay_seconds: float = Field(default=0.3, ge=0, alias="AI_RETRY_DELAY_SECONDS")
    ai_max_attempts: int = Field(default=2, ge=1, le=5, alias="AI_MAX_ATTEMPTS")

    # Bare Gemini model ids — no `google/` provider prefix, which was a gateway
    # routing convention rather than part of the model name.
    synthesis_model: str = Field(default="gemini-2.5-flash-lite", alias="AI_SYNTHESIS_MODEL")
    image_model: str = Field(default="gemini-2.5-flash-image", alias="AI_IMAGE_MODEL")
    translation_model: str = Field(default="gemini-2.5-flash-lite", alias="AI_TRANSLATION_MODEL")
    tts_model: str = Field(default="gemini-2.5-flash-preview-tts", alias="AI_TTS_MODEL")
    # Gemini's prebuilt voice names are a fixed, capitalised set; "Kore" is the
    # closest match to the newsreader delivery the old `eve` voice gave.
    tts_voice: str = Field(default="Kore", alias="AI_TTS_VOICE")

    # 2.5 models can spend output tokens on internal reasoning before emitting a
    # single character. For a two-second briefing that is pure latency, and a
    # thought-heavy response can exhaust max_output_tokens and return no text at
    # all — so thinking is off by default. Raise it only to debug output quality.
    gemini_thinking_budget: int = Field(default=0, ge=0, alias="GEMINI_THINKING_BUDGET")

    # This platform covers civil rights, police accountability and geopolitics.
    # At Gemini's default thresholds, factual reporting on those beats is blocked
    # as harmful often enough to break the feed, so the engine asks for the
    # least-restrictive setting the API allows and relies on its own editorial
    # prompt plus `prompt_safety` for control.
    gemini_safety_threshold: str = Field(
        default="BLOCK_ONLY_HIGH", alias="GEMINI_SAFETY_THRESHOLD"
    )

    # ── Service auth ─────────────────────────────────────────────────────────
    service_jwt_secret: str = Field(default="", alias="SERVICE_JWT_SECRET")
    service_jwt_algorithm: str = Field(default="HS256", alias="SERVICE_JWT_ALGORITHM")
    service_jwt_issuer: str = Field(default="blacknexa-backend", alias="SERVICE_JWT_ISSUER")
    service_jwt_audience: str = Field(default="blacknexa-ai-engine", alias="SERVICE_JWT_AUDIENCE")
    # Bounded lifetime for tokens the engine mints for its own CLI/tests.
    service_token_ttl_minutes: int = Field(default=60, ge=1, alias="SERVICE_TOKEN_TTL_MINUTES")

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Intentionally empty: this service is called server-to-server, so no browser
    # origin is legitimate. Populate only if a trusted internal console needs it.
    cors_origins: str = Field(default="", alias="CORS_ORIGINS")

    # ── Rate limiting ────────────────────────────────────────────────────────
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_default: str = Field(default="600/minute", alias="RATE_LIMIT_DEFAULT")
    # Generation is the expensive path — every call costs real gateway spend.
    rate_limit_generation: str = Field(default="60/minute", alias="RATE_LIMIT_GENERATION")

    # ── Prompt-injection guardrails ──────────────────────────────────────────
    max_topic_prompt_chars: int = Field(default=1000, ge=16, alias="MAX_TOPIC_PROMPT_CHARS")
    max_source_excerpt_chars: int = Field(default=4000, ge=100, alias="MAX_SOURCE_EXCERPT_CHARS")
    max_translate_content_chars: int = Field(
        default=200_000, ge=1000, alias="MAX_TRANSLATE_CONTENT_CHARS"
    )
    # When true, a topicPrompt carrying instruction-override phrasing is refused
    # outright instead of being neutralised and passed through.
    reject_suspicious_prompts: bool = Field(default=True, alias="REJECT_SUSPICIOUS_PROMPTS")

    # ── Run-log persistence (optional) ───────────────────────────────────────
    # Operational observability only: timings, token-ish counts, outcomes. Never
    # article content. With no DATABASE_URL the engine runs fully stateless.
    database_url: str = Field(default="", alias="DATABASE_URL")
    db_echo: bool = Field(default=False, alias="DB_ECHO")
    db_pool_size: int = Field(default=5, ge=1, alias="DB_POOL_SIZE")
    run_log_retention_days: int = Field(default=30, ge=1, alias="RUN_LOG_RETENTION_DAYS")

    # ── Derived ──────────────────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def ai_enabled(self) -> bool:
        """True when a Gemini call can actually be made.

        Mirrors `env.ai.enabled` in Node. When false every AI path degrades to a
        null result rather than raising, so the caller's feed keeps working.
        """
        return bool(self.gemini_base_url and self.gemini_api_key)

    @property
    def search_enabled(self) -> bool:
        """True when Exa can be reached.

        Tracked separately from `ai_enabled` because the failure modes differ: no
        Gemini key means nothing generates at all, while no Exa key means search
        returns no hits and synthesis stops at `no_source_material` — the same
        path a genuinely empty result set already takes.
        """
        return bool(self.exa_base_url and self.exa_api_key)

    @property
    def persistence_enabled(self) -> bool:
        return bool(self.database_url)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ── Validation ───────────────────────────────────────────────────────────

    @field_validator("gemini_base_url", "exa_base_url")
    @classmethod
    def _strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @field_validator("gemini_safety_threshold")
    @classmethod
    def _valid_safety_threshold(cls, v: str) -> str:
        allowed = {
            "BLOCK_NONE",
            "BLOCK_ONLY_HIGH",
            "BLOCK_MEDIUM_AND_ABOVE",
            "BLOCK_LOW_AND_ABOVE",
            "OFF",
        }
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"GEMINI_SAFETY_THRESHOLD must be one of {sorted(allowed)}")
        return upper

    @field_validator("log_level")
    @classmethod
    def _valid_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {sorted(allowed)}")
        return upper

    @model_validator(mode="after")
    def _check_production_requirements(self) -> Settings:
        problems: list[str] = []

        # A signing secret is mandatory everywhere — an unauthenticated engine
        # would let anyone spend the gateway budget.
        if not self.service_jwt_secret:
            problems.append("SERVICE_JWT_SECRET is required")
        elif len(self.service_jwt_secret) < 32:
            problems.append("SERVICE_JWT_SECRET must be at least 32 characters")

        if self.is_production:
            if not self.gemini_api_key:
                problems.append("GEMINI_API_KEY is required in production")
            # Without grounding the engine can only invent, which the product
            # forbids outright — so this is required, not optional.
            if not self.exa_api_key:
                problems.append("EXA_API_KEY is required in production")
            if "*" in self.cors_origin_list:
                problems.append("CORS_ORIGINS must not contain '*'")
            if not self.log_json:
                problems.append("LOG_JSON should be true in production for structured logs")

        if problems:
            raise ValueError("; ".join(problems))
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load and cache settings, exiting the process on invalid configuration."""
    try:
        return Settings()
    except ValidationError as exc:
        lines = [f"  • {e['loc'][0] if e['loc'] else 'config'}: {e['msg']}" for e in exc.errors()]
        sys.stderr.write(
            "\n[config] Invalid environment configuration — refusing to start:\n"
            + "\n".join(lines)
            + "\n\nCopy .env.example to .env and fill in the required values.\n\n"
        )
        raise SystemExit(1) from exc


settings = get_settings()
