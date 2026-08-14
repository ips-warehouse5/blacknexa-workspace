"""Environment configuration with fail-fast validation.

Mirrors the Node service's `env.config.ts`: everything the engine needs is declared
in one settings model and validated before anything boots. A missing or malformed
value aborts startup with a readable list rather than surfacing later as a runtime
failure or, worse, a silently insecure default.

No secret has a usable default. `AI_TOOLKIT_SECRET_KEY` and `SERVICE_JWT_SECRET`
must be supplied.
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

    # ── AI gateway (Rork Toolkit) ────────────────────────────────────────────
    # Same upstream the Node service uses, so the engine is a drop-in for it.
    ai_toolkit_url: str = Field(default="https://toolkit.rork.com", alias="AI_TOOLKIT_URL")
    ai_toolkit_secret_key: str = Field(default="", alias="AI_TOOLKIT_SECRET_KEY")

    # Ported verbatim from ai_gateway.service.ts / http.util.ts.
    ai_timeout_seconds: float = Field(default=20.0, gt=0, alias="AI_TIMEOUT_SECONDS")
    ai_retry_delay_seconds: float = Field(default=0.3, ge=0, alias="AI_RETRY_DELAY_SECONDS")
    ai_max_attempts: int = Field(default=2, ge=1, le=5, alias="AI_MAX_ATTEMPTS")

    synthesis_model: str = Field(
        default="google/gemini-2.5-flash-lite", alias="AI_SYNTHESIS_MODEL"
    )
    image_model: str = Field(default="google/gemini-2.5-flash-image", alias="AI_IMAGE_MODEL")
    translation_model: str = Field(
        default="google/gemini-2.5-flash-lite", alias="AI_TRANSLATION_MODEL"
    )
    tts_model: str = Field(default="xai/grok-tts", alias="AI_TTS_MODEL")
    tts_voice: str = Field(default="eve", alias="AI_TTS_VOICE")

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
        """True when a gateway call can actually be made.

        Mirrors `env.ai.enabled` in Node. When false every AI path degrades to a
        null result rather than raising, so the caller's feed keeps working.
        """
        return bool(self.ai_toolkit_url and self.ai_toolkit_secret_key)

    @property
    def persistence_enabled(self) -> bool:
        return bool(self.database_url)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ── Validation ───────────────────────────────────────────────────────────

    @field_validator("ai_toolkit_url")
    @classmethod
    def _strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

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
            if not self.ai_toolkit_secret_key:
                problems.append("AI_TOOLKIT_SECRET_KEY is required in production")
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
