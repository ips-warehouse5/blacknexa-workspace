"""Rate limiting.

Keyed by the **caller identity from the service token**, not by IP. Every legitimate
request comes from the same Node backend, so an IP key would lump the whole estate
into one bucket and a single busy daily batch would throttle everything else.

The limits exist for a different reason than on a public API: each generation call
spends real money at the AI gateway, so an unbounded caller — a retry storm, a
misconfigured cron running on every replica — is a billing incident.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.errors import AuthError
from app.core.security import decode_service_token


def caller_key(request: Request) -> str:
    """Bucket by token subject, falling back to the peer address.

    Decoding is best-effort: an unauthenticated request is about to be rejected by
    the auth dependency anyway, and it should still be rate limited on the way.
    """
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        try:
            return f"svc:{decode_service_token(token).sub}"
        except AuthError:
            # An invalid token still gets rate limited, keyed by address — that is
            # the case where limiting matters most. `decode_service_token` already
            # logged the reason, so nothing is lost by falling through here.
            pass
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=caller_key,
    default_limits=[settings.rate_limit_default] if settings.rate_limit_enabled else [],
    enabled=settings.rate_limit_enabled,
    headers_enabled=True,
)
