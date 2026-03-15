from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx

from ..config import settings
from ..models import PostureCoachReviewRequest

POSTURE_REVIEW_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "posture_label": {
            "type": "string",
            "enum": [
                "aligned",
                "mild_forward_head",
                "slumped_forward",
                "asymmetrical_load",
                "temporary_non_desk_pose",
                "unclear",
            ],
        },
        "severity": {
            "type": "string",
            "enum": ["good", "mild", "moderate"],
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
        },
        "should_trigger_alert": {"type": "boolean"},
        "desk_pose": {
            "type": "string",
            "enum": ["neutral_desk_pose", "temporary_non_desk_pose", "unclear"],
        },
        "camera_angle_limited": {"type": "boolean"},
        "reasons": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 4,
        },
        "coaching": {
            "type": "string",
            "minLength": 1,
            "maxLength": 240,
        },
        "wellness_note": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160,
        },
    },
    "required": [
        "posture_label",
        "severity",
        "confidence",
        "should_trigger_alert",
        "desk_pose",
        "camera_angle_limited",
        "reasons",
        "coaching",
        "wellness_note",
    ],
}

SYSTEM_INSTRUCTIONS = """
You are EyeGuard's optional posture coach for a wellness app.
Assess a single webcam snapshot for desk-work posture only.
This is wellness support, not medical diagnosis.

Rules:
- Be cautious about camera angle and image ambiguity.
- Judge posture for sustained desk work, not a one-second casual pose.
- If the person appears to be on a phone call, resting on a hand, or otherwise not in a neutral work posture, prefer temporary_non_desk_pose or asymmetrical_load.
- Use mild_forward_head for a mild head/neck drift without a full slump.
- Use slumped_forward for dropped head, rounded upper body, or compressed neck/shoulder posture.
- Use aligned only if the posture looks reasonably neutral for computer work.
- Keep reasons short and concrete.
- Keep coaching actionable and non-medical.
- Return only JSON matching the schema.
""".strip()


def coach_is_available() -> bool:
    return bool(settings.openai_api_key)


def _build_user_prompt(payload: PostureCoachReviewRequest) -> str:
    local_context = payload.local_context
    if local_context is None:
        local_summary = "No local heuristic context was provided."
    else:
        metrics = local_context.metrics
        metric_summary = (
            "none"
            if metrics is None
            else (
                f"score={metrics.score:.3f}, "
                f"roll_delta={metrics.roll_delta_degrees:.1f}, "
                f"vertical_delta={metrics.vertical_delta:.3f}, "
                f"lean_delta={metrics.lean_delta:.3f}, "
                f"shoulder_neck_delta={metrics.shoulder_neck_delta:.3f}"
            )
        )
        local_summary = (
            f"Local posture state: {local_context.posture_state}. "
            f"Local reasons: {', '.join(local_context.reasons) if local_context.reasons else 'none'}. "
            f"Local metrics: {metric_summary}."
        )

    return (
        "Review this single webcam frame for desk-work wellness posture. "
        "Treat the image as a temporary snapshot and note when camera angle limits certainty. "
        f"{local_summary}"
    )


def _extract_output_text(response_payload: dict) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    for item in response_payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]

    raise ValueError("OpenAI response did not contain output text.")


async def review_posture_snapshot(payload: PostureCoachReviewRequest) -> dict:
    request_payload = {
        "model": settings.openai_posture_model,
        "instructions": SYSTEM_INSTRUCTIONS,
        "max_output_tokens": 260,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "eyeguard_posture_review",
                "strict": True,
                "schema": POSTURE_REVIEW_SCHEMA,
            }
        },
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": _build_user_prompt(payload),
                    },
                    {
                        "type": "input_image",
                        "image_url": payload.image_data_url,
                        "detail": "auto",
                    },
                ],
            }
        ],
    }

    async with httpx.AsyncClient(timeout=settings.openai_timeout_seconds) as client:
        response = await client.post(
            f"{settings.openai_base_url}/responses",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=request_payload,
        )
        response.raise_for_status()
        raw_payload = response.json()

    parsed = json.loads(_extract_output_text(raw_payload))
    parsed["reviewed_at"] = datetime.now(UTC).isoformat()
    parsed["model"] = settings.openai_posture_model
    return parsed
