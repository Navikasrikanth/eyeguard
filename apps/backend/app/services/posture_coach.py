from __future__ import annotations

from ..config import settings
from ..models import PostureCoachReviewRequest
from . import gemini_posture_coach, openai_posture_coach


def coach_provider() -> str:
    return settings.ai_provider if settings.ai_provider in {"openai", "gemini"} else "openai"


def coach_is_available() -> bool:
    provider = coach_provider()
    if provider == "gemini":
        return bool(settings.gemini_api_key)
    return bool(settings.openai_api_key)


def coach_model_name() -> str | None:
    provider = coach_provider()
    if provider == "gemini":
        return settings.gemini_posture_model if settings.gemini_api_key else None
    return settings.openai_posture_model if settings.openai_api_key else None


async def review_posture_snapshot(payload: PostureCoachReviewRequest) -> dict:
    provider = coach_provider()
    if provider == "gemini":
        return await gemini_posture_coach.review_posture_snapshot(payload)
    return await openai_posture_coach.review_posture_snapshot(payload)
