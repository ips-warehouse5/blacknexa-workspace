"""Internal content-moderation route.

`POST /api/v1/internal/moderation/assess` — called only by the Node moderation
worker (`aiEngineClient.assessModeration()`) with a service token, once per
moderation run (INCIDENT_MODULE_PLAN.md §5.3 step 4, §6.1). The handler is thin:
validate, run the service, return. The service owns the always-200 contract and
the run-log row.

Rate limited on its own budget (`RATE_LIMIT_MODERATION`, 300/minute): every
filing, edit, comment and flag re-check from every API replica lands here, so it
cannot share the 60/minute generation bucket — but an unbounded caller is still a
billing incident. Two slowapi rules, both learned from a real outage (see
`tests/unit/test_rate_limit.py`): `@limiter.limit` sits *below* `@router.post`,
and the handler declares both `request: Request` and `response: Response`.

`background_tasks` carries the run-log write past the response (review R19): the
row is observability, and awaiting it before answering let a slow run-log
database push the verdict past Node's 40 s abort.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Request, Response

from app.api.rate_limit import limiter
from app.core.config import settings
from app.core.security import ServiceCaller
from app.schemas.moderation import ModerationRequest, ModerationResponse
from app.services import moderation_service

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.post(
    "/assess",
    response_model=ModerationResponse,
    summary="Assess member content before it is published",
)
@limiter.limit(settings.rate_limit_moderation)
async def assess(
    request: Request,
    response: Response,
    payload: ModerationRequest,
    caller: ServiceCaller,
    background_tasks: BackgroundTasks,
) -> ModerationResponse:
    """Assess one report or comment (text plus photo thumbnails).

    Always 200 for a valid request; `status` says whether the content was
    `assessed`, the assessment was `unavailable` (Node retries it when
    `retryable` is true), or the provider `blocked` it (Node holds it for a
    human). The AI never rejects: the recommendation is `approve` or `review`.
    """
    return await moderation_service.assess(
        payload, caller=caller.sub, background=background_tasks
    )
