from __future__ import annotations

import logging
import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status

from ..deps import get_connection, get_current_user_id
from ..models import BlinkEventRequest, BreakEventRequest, PostureEventRequest, ReminderEventRequest, SessionTickRequest
from ..services.repository import ensure_daily_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])
logger = logging.getLogger("eyeguard.metrics")


def _day_from_iso(value: str) -> str:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()


def _increment_daily_metric(
    db: sqlite3.Connection,
    *,
    user_id: int,
    metric_date: str,
    screen_time: int = 0,
    breaks: int = 0,
    alerts: int = 0,
    posture_alerts: int = 0,
    blinks: int = 0,
) -> None:
    ensure_daily_metrics(db, user_id=user_id, metric_date=metric_date)
    db.execute(
        """
        UPDATE daily_metrics
        SET total_screen_time_seconds = total_screen_time_seconds + ?,
            total_breaks = total_breaks + ?,
            total_alerts = total_alerts + ?,
            posture_alerts = posture_alerts + ?,
            total_blinks = total_blinks + ?
        WHERE user_id = ? AND metric_date = ?
        """,
        (screen_time, breaks, alerts, posture_alerts, blinks, user_id, metric_date),
    )


@router.post("/session-tick", status_code=status.HTTP_202_ACCEPTED)
def record_session_tick(
    payload: SessionTickRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> dict[str, bool]:
    metric_date = datetime.now(UTC).date().isoformat()
    _increment_daily_metric(db, user_id=user_id, metric_date=metric_date, screen_time=payload.elapsed_seconds)
    return {"ok": True}


@router.post("/blink", status_code=status.HTTP_202_ACCEPTED)
def record_blink(
    payload: BlinkEventRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> dict[str, bool]:
    metric_date = _day_from_iso(payload.bucket_start)
    _increment_daily_metric(db, user_id=user_id, metric_date=metric_date, blinks=payload.count)
    db.execute(
        """
        INSERT INTO blink_buckets (user_id, bucket_start, blink_count)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, bucket_start)
        DO UPDATE SET blink_count = blink_count + excluded.blink_count
        """,
        (user_id, payload.bucket_start, payload.count),
    )
    return {"ok": True}


@router.post("/posture", status_code=status.HTTP_202_ACCEPTED)
def record_posture_event(
    payload: PostureEventRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> dict[str, bool]:
    metric_date = _day_from_iso(payload.occurred_at)
    _increment_daily_metric(db, user_id=user_id, metric_date=metric_date, alerts=1, posture_alerts=1)
    details_json = payload.details.model_dump_json() if payload.details else None
    db.execute(
        """
        INSERT INTO posture_events (user_id, created_at, severity, message, details_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, payload.occurred_at, payload.severity, payload.message, details_json),
    )
    if payload.details:
        metrics = payload.details.metrics
        logger.warning(
            (
                "Posture alert user=%s severity=%s bad=%s score=%.2f "
                "roll_delta=%.1fdeg vertical_delta=%.3f center_delta=%.3f lean_delta=%.3f "
                "shoulder_roll_delta=%.1fdeg shoulder_neck_delta=%.3f message=%s"
            ),
            user_id,
            payload.severity,
            ", ".join(payload.details.reasons) or "unknown",
            metrics.score,
            metrics.roll_delta_degrees,
            metrics.vertical_delta,
            metrics.center_delta,
            metrics.lean_delta,
            metrics.shoulder_roll_delta_degrees,
            metrics.shoulder_neck_delta,
            payload.message,
        )
    else:
        logger.warning("Posture alert user=%s severity=%s message=%s", user_id, payload.severity, payload.message)
    return {"ok": True}


@router.post("/reminder", status_code=status.HTTP_202_ACCEPTED)
def record_reminder(
    payload: ReminderEventRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> dict[str, bool]:
    metric_date = _day_from_iso(payload.occurred_at)
    _increment_daily_metric(db, user_id=user_id, metric_date=metric_date, alerts=1)
    db.execute(
        """
        INSERT INTO reminder_events (user_id, created_at, kind)
        VALUES (?, ?, ?)
        """,
        (user_id, payload.occurred_at, payload.kind),
    )
    return {"ok": True}


@router.post("/break", status_code=status.HTTP_202_ACCEPTED)
def record_break(
    payload: BreakEventRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> dict[str, bool]:
    metric_date = _day_from_iso(payload.started_at)
    _increment_daily_metric(db, user_id=user_id, metric_date=metric_date, breaks=1)
    db.execute(
        """
        INSERT INTO break_events (user_id, started_at, ended_at, duration_seconds, initiated_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, payload.started_at, payload.ended_at, payload.duration_seconds, payload.initiated_by),
    )
    return {"ok": True}
