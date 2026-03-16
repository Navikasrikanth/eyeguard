from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..deps import get_current_user_id
from ..models import CoachStatusResponse, PostureCoachReviewRequest, PostureCoachReviewResponse
from ..services.posture_coach import coach_is_available, coach_model_name, coach_provider, review_posture_snapshot

router = APIRouter(prefix="/coach", tags=["coach"])
logger = logging.getLogger("eyeguard.coach")


def _upstream_detail(error: httpx.HTTPStatusError) -> str | None:
    try:
        payload = error.response.json()
    except Exception:
        return None

    upstream_error = payload.get("error")
    if isinstance(upstream_error, dict):
        message = upstream_error.get("message")
        if isinstance(message, str) and message.strip():
            return message

    detail = payload.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail

    return None


@router.get("/status", response_model=CoachStatusResponse)
def coach_status(_user_id: int = Depends(get_current_user_id)) -> CoachStatusResponse:
    provider = coach_provider()
    model_name = coach_model_name()
    if coach_is_available():
        return CoachStatusResponse(
            available=True,
            provider=provider,
            model=model_name,
            note=(
                f"Optional AI posture review is ready via {provider}. "
                "EyeGuard sends a single snapshot only when you request it."
            ),
        )
    return CoachStatusResponse(
        available=False,
        provider=provider,
        model=None,
        note=(
            "Optional AI posture review is off. "
            "Set OPENAI_API_KEY for OpenAI or GEMINI_API_KEY with AI_PROVIDER=gemini to enable it."
        ),
    )


@router.post("/posture-review", response_model=PostureCoachReviewResponse)
async def posture_review(
    payload: PostureCoachReviewRequest,
    user_id: int = Depends(get_current_user_id),
) -> PostureCoachReviewResponse:
    if not coach_is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured. Set OPENAI_API_KEY on the backend to enable it.",
        )

    try:
        return PostureCoachReviewResponse(**(await review_posture_snapshot(payload)))
    except httpx.TimeoutException as error:
        logger.warning("AI coach timed out user=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The AI coach took too long to respond. Please try again.",
        ) from error
    except httpx.HTTPStatusError as error:
        upstream_detail = _upstream_detail(error)
        logger.warning(
            "AI coach upstream error user=%s status=%s detail=%s",
            user_id,
            error.response.status_code,
            upstream_detail or "n/a",
        )
        if error.response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=upstream_detail
                or "The AI coach hit an OpenAI rate limit or quota limit. Wait a bit, reduce requests, or check billing and model access.",
            ) from error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=upstream_detail or "The AI coach could not complete the review right now.",
        ) from error
    except Exception as error:
        logger.exception("AI coach review failed user=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The AI coach failed to review this snapshot.",
        ) from error
