from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from ..models import SettingsResponse
from .security import sha256


def row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "username": row["username"],
        "full_name": row["full_name"],
        "avatar_url": row["avatar_url"],
        "bio": row["bio"],
        "language": row["language"],
        "created_at": row["created_at"],
    }


def row_to_settings(row: sqlite3.Row) -> SettingsResponse:
    return SettingsResponse(
        language=row["language"],
        reminder_interval_minutes=row["reminder_interval_minutes"],
        notifications_enabled=bool(row["notifications_enabled"]),
        camera_enabled=bool(row["camera_enabled"]),
        posture_sensitivity=float(row["posture_sensitivity"]),
        launch_on_startup=bool(row["launch_on_startup"]),
        force_break_enabled=bool(row["force_break_enabled"]),
    )


def get_user_by_email(db: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    return db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def get_user_by_id(db: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def get_settings(db: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = db.execute(
        """
        SELECT users.language,
               settings.reminder_interval_minutes,
               settings.notifications_enabled,
               settings.camera_enabled,
               settings.posture_sensitivity,
               settings.launch_on_startup,
               settings.force_break_enabled
        FROM settings
        JOIN users ON users.id = settings.user_id
        WHERE settings.user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Settings not found for user.")
    return row


def create_user(
    db: sqlite3.Connection,
    *,
    email: str,
    username: str,
    password_hash: str,
    created_at: str,
) -> int:
    cursor = db.execute(
        """
        INSERT INTO users (email, username, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (email, username, password_hash, created_at),
    )
    user_id = int(cursor.lastrowid)
    db.execute(
        """
        INSERT INTO settings (
            user_id,
            reminder_interval_minutes,
            notifications_enabled,
            camera_enabled,
            posture_sensitivity,
            launch_on_startup,
            force_break_enabled
        ) VALUES (?, 20, 1, 1, 0.62, 0, 0)
        """,
        (user_id,),
    )
    return user_id


def store_refresh_token(db: sqlite3.Connection, *, user_id: int, token: str, expires_at: str, created_at: str) -> None:
    db.execute(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, sha256(token), expires_at, created_at),
    )


def is_refresh_token_valid(db: sqlite3.Connection, *, user_id: int, token: str) -> bool:
    now_iso = datetime.now(UTC).isoformat()
    row = db.execute(
        """
        SELECT id
        FROM refresh_tokens
        WHERE user_id = ?
          AND token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > ?
        """,
        (user_id, sha256(token), now_iso),
    ).fetchone()
    return row is not None


def revoke_refresh_token(db: sqlite3.Connection, *, token: str) -> None:
    db.execute(
        """
        UPDATE refresh_tokens
        SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
        """,
        (datetime.now(UTC).isoformat(), sha256(token)),
    )


def ensure_daily_metrics(db: sqlite3.Connection, *, user_id: int, metric_date: str) -> None:
    db.execute(
        """
        INSERT INTO daily_metrics (user_id, metric_date)
        VALUES (?, ?)
        ON CONFLICT(user_id, metric_date) DO NOTHING
        """,
        (user_id, metric_date),
    )
