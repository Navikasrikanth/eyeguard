from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query

from ..deps import get_connection, get_current_user_id
from ..models import AnalyticsSummaryResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _normalize_posture_details(details_json: str | None) -> dict | None:
    if not details_json:
        return None
    try:
        details = json.loads(details_json)
    except json.JSONDecodeError:
        return None

    metrics = details.get("metrics") or {}
    details["metrics"] = {
        "roll_degrees": metrics.get("roll_degrees", 0.0),
        "roll_delta_degrees": metrics.get("roll_delta_degrees", 0.0),
        "vertical_ratio": metrics.get("vertical_ratio", 0.0),
        "vertical_delta": metrics.get("vertical_delta", 0.0),
        "center_offset_ratio": metrics.get("center_offset_ratio", 0.0),
        "center_delta": metrics.get("center_delta", 0.0),
        "lean_ratio": metrics.get("lean_ratio", 0.0),
        "lean_delta": metrics.get("lean_delta", 0.0),
        "shoulder_roll_degrees": metrics.get("shoulder_roll_degrees", 0.0),
        "shoulder_roll_delta_degrees": metrics.get("shoulder_roll_delta_degrees", 0.0),
        "shoulder_neck_ratio": metrics.get("shoulder_neck_ratio", 0.0),
        "shoulder_neck_delta": metrics.get("shoulder_neck_delta", 0.0),
        "score": metrics.get("score", 0.0),
    }
    details["baseline_ready"] = bool(details.get("baseline_ready", False))
    details["reasons"] = list(details.get("reasons") or [])
    return details


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def summary(
    days: int = Query(default=14, ge=1, le=90),
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> AnalyticsSummaryResponse:
    cutoff = (datetime.now(UTC) - timedelta(days=days - 1)).date().isoformat()
    history_rows = db.execute(
        """
        SELECT metric_date,
               total_screen_time_seconds,
               total_breaks,
               total_alerts,
               posture_alerts,
               total_blinks
        FROM daily_metrics
        WHERE user_id = ? AND metric_date >= ?
        ORDER BY metric_date ASC
        """,
        (user_id, cutoff),
    ).fetchall()
    history = [
        {
            "date": row["metric_date"],
            "total_screen_time_seconds": row["total_screen_time_seconds"],
            "total_breaks": row["total_breaks"],
            "total_alerts": row["total_alerts"],
            "posture_alerts": row["posture_alerts"],
            "total_blinks": row["total_blinks"],
        }
        for row in history_rows
    ]

    today = next((item for item in reversed(history) if item["date"] == datetime.now(UTC).date().isoformat()), None)

    totals = {
        "screenTimeSeconds": sum(item["total_screen_time_seconds"] for item in history),
        "breaks": sum(item["total_breaks"] for item in history),
        "alerts": sum(item["total_alerts"] for item in history),
        "postureAlerts": sum(item["posture_alerts"] for item in history),
        "blinks": sum(item["total_blinks"] for item in history),
    }

    streak_days = 0
    for item in reversed(history):
        if item["total_breaks"] > 0 or item["total_screen_time_seconds"] > 0:
            streak_days += 1
        else:
            break

    posture_events = [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "severity": row["severity"],
            "message": row["message"],
            "details": _normalize_posture_details(row["details_json"]),
        }
        for row in db.execute(
            """
            SELECT id, created_at, severity, message, details_json
            FROM posture_events
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 8
            """,
            (user_id,),
        ).fetchall()
    ]

    break_events = [
        {
            "id": row["id"],
            "started_at": row["started_at"],
            "ended_at": row["ended_at"],
            "duration_seconds": row["duration_seconds"],
            "initiated_by": row["initiated_by"],
        }
        for row in db.execute(
            """
            SELECT id, started_at, ended_at, duration_seconds, initiated_by
            FROM break_events
            WHERE user_id = ?
            ORDER BY started_at DESC
            LIMIT 10
            """,
            (user_id,),
        ).fetchall()
    ]

    blink_buckets = [
        {"bucket_start": row["bucket_start"], "blink_count": row["blink_count"]}
        for row in db.execute(
            """
            SELECT bucket_start, blink_count
            FROM blink_buckets
            WHERE user_id = ?
              AND bucket_start >= ?
            ORDER BY bucket_start ASC
            LIMIT 1440
            """,
            (user_id, f"{cutoff}T00:00:00+00:00"),
        ).fetchall()
    ]

    return AnalyticsSummaryResponse(
        today=today,
        streak_days=streak_days,
        totals=totals,
        history=history,
        posture_events=posture_events,
        break_events=break_events,
        blink_buckets=blink_buckets,
    )
