"""Service authentication and role-based access control.

This engine is called server-to-server by `blacknexa-backend`, never by a browser
or a mobile app. Authentication is therefore a signed service token rather than a
user session.

Token design:
  • HS256, shared secret with the Node service.
  • `scope` distinguishes a service caller from a human operator.
  • `iss` / `aud` are verified, so a token minted for another service in the same
    estate cannot be replayed here.
  • Short TTL; the Node client mints on demand and does not persist them.

Without a valid token the engine answers 401. That matters more than usual here:
every generation call spends real money at the AI gateway, so an open engine is a
billing vulnerability as much as a data one.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.errors import AuthError, ForbiddenError
from app.core.logging import get_logger

logger = get_logger(__name__)

Scope = Literal["service", "admin"]
Role = Literal["service", "admin", "auditor"]


class TokenPayload(BaseModel):
    """Verified claims from a service token."""

    sub: str = Field(description="Caller identity, e.g. 'blacknexa-backend'")
    scope: Scope = "service"
    role: Role = "service"
    iss: str | None = None
    aud: str | None = None
    exp: int | None = None


# `auto_error=False` so a missing header raises our own AuthError with a
# consistent body rather than FastAPI's default shape.
_bearer = HTTPBearer(auto_error=False)


def create_service_token(
    subject: str = "blacknexa-backend",
    scope: Scope = "service",
    role: Role = "service",
    ttl_minutes: int | None = None,
) -> str:
    """Mint a token. Used by the CLI helper and the test suite."""
    now = datetime.now(UTC)
    ttl = ttl_minutes if ttl_minutes is not None else settings.service_token_ttl_minutes
    claims: dict[str, Any] = {
        "sub": subject,
        "scope": scope,
        "role": role,
        "iss": settings.service_jwt_issuer,
        "aud": settings.service_jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl)).timestamp()),
    }
    token: str = jwt.encode(
        claims, settings.service_jwt_secret, algorithm=settings.service_jwt_algorithm
    )
    return token


def decode_service_token(token: str) -> TokenPayload:
    """Verify signature, issuer, audience and expiry."""
    try:
        claims = jwt.decode(
            token,
            settings.service_jwt_secret,
            algorithms=[settings.service_jwt_algorithm],
            issuer=settings.service_jwt_issuer,
            audience=settings.service_jwt_audience,
        )
    except JWTError as exc:
        # The reason is logged but never returned — a caller learning *why* a
        # token failed is a small oracle.
        logger.warning("token_rejected", reason=str(exc))
        raise AuthError("Invalid or expired service token.") from exc

    return TokenPayload.model_validate(claims)


async def require_service(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> TokenPayload:
    """Dependency for `/internal/*`. Accepts any valid token."""
    if credentials is None or not credentials.credentials:
        raise AuthError("A bearer service token is required.")

    payload = decode_service_token(credentials.credentials)
    request.state.caller = payload.sub
    return payload


def require_roles(*allowed: Role) -> Any:
    """Dependency factory for `/admin/*`.

    Roles are listed explicitly per route — `admin` is not implicitly granted
    everything, so the permitted set is readable at the route itself.
    """

    async def _dependency(
        payload: Annotated[TokenPayload, Depends(require_service)],
    ) -> TokenPayload:
        if payload.role not in allowed:
            logger.warning(
                "role_denied", caller=payload.sub, role=payload.role, required=list(allowed)
            )
            raise ForbiddenError()
        return payload

    return _dependency


ServiceCaller = Annotated[TokenPayload, Depends(require_service)]
