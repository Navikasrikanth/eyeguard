from __future__ import annotations

import base64
import json
from datetime import UTC, datetime

import httpx

from ..config import settings
from ..models import PostureCoachReviewRequest
from .openai_posture_coach import POSTURE_REVIEW_SCHEMA, SYSTEM_INSTRUCTIONS, _build_user_prompt


def _parse_data_url(image_data_url: str) -> tuple[str, str]:
    prefix, _, encoded = image_data_url.partition(",")
    if not prefix.startswith("data:") or ";base64" not in prefix or not encoded:
        raise ValueError("Expected a base64 data URL image.")
    mime_type = prefix[5:].split(";", 1)[0] or "image/jpeg"
    # Validate base64 before sending upstream.
    base64.b64decode(encoded, validate=True)
    return mime_type, encoded


def _extract_output_text(response_payload: dict) -> str:
    candidates = response_payload.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini response did not include any candidates.")
    content = candidates[0].get("content") or {}
    for part in content.get("parts") or []:
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            return text
    raise ValueError("Gemini response did not contain output text.")


async def review_posture_snapshot(payload: PostureCoachReviewRequest) -> dict:
    mime_type, encoded_image = _parse_data_url(payload.image_data_url)
    request_payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_INSTRUCTIONS}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": _build_user_prompt(payload)},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": encoded_image,
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": POSTURE_REVIEW_SCHEMA,
        },
    }

    async with httpx.AsyncClient(timeout=settings.openai_timeout_seconds) as client:
        response = await client.post(
            f"{settings.gemini_base_url}/models/{settings.gemini_posture_model}:generateContent",
            headers={"x-goog-api-key": settings.gemini_api_key or ""},
            json=request_payload,
        )
        response.raise_for_status()
        raw_payload = response.json()

    parsed = json.loads(_extract_output_text(raw_payload))
    parsed["reviewed_at"] = datetime.now(UTC).isoformat()
    parsed["model"] = settings.gemini_posture_model
    return parsed
