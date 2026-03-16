from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..deps import get_connection, get_current_user_id
from ..models import PasswordChangeRequest, ProfileUpdateRequest, SettingsResponse, SettingsUpdateRequest, UserProfileResponse
from ..services.repository import get_settings, get_user_by_id, row_to_settings, row_to_user
from ..services.security import hash_password, verify_password

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=UserProfileResponse)
def get_me(
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> UserProfileResponse:
    row = get_user_by_id(db, user_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserProfileResponse(**row_to_user(row))


@router.patch("/users/me", response_model=UserProfileResponse)
def update_me(
    payload: ProfileUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> UserProfileResponse:
    existing = get_user_by_id(db, user_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        return UserProfileResponse(**row_to_user(existing))

    updates = []
    values: list[object] = []
    field_map = {
        "username": "username",
        "full_name": "full_name",
        "avatar_url": "avatar_url",
        "bio": "bio",
        "language": "language",
    }
    for field, column in field_map.items():
        if field in data:
            value = data[field]
            if isinstance(value, str):
                value = value.strip()
            updates.append(f"{column} = ?")
            values.append(value)

    values.append(user_id)
    db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
    updated = get_user_by_id(db, user_id)
    return UserProfileResponse(**row_to_user(updated))


@router.post("/users/me/password", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def change_password(
    payload: PasswordChangeRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> Response:
    row = get_user_by_id(db, user_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if not verify_password(payload.current_password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(payload.new_password), user_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/settings/me", response_model=SettingsResponse)
def get_my_settings(
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> SettingsResponse:
    return row_to_settings(get_settings(db, user_id))


@router.patch("/settings/me", response_model=SettingsResponse)
def update_my_settings(
    payload: SettingsUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: sqlite3.Connection = Depends(get_connection),
) -> SettingsResponse:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return row_to_settings(get_settings(db, user_id))

    if "language" in data:
        db.execute("UPDATE users SET language = ? WHERE id = ?", (data["language"], user_id))

    settings_updates = []
    values: list[object] = []
    for field in (
        "reminder_interval_minutes",
        "notifications_enabled",
        "camera_enabled",
        "posture_sensitivity",
        "launch_on_startup",
        "force_break_enabled",
    ):
        if field in data:
            value = data[field]
            if isinstance(value, bool):
                value = int(value)
            settings_updates.append(f"{field} = ?")
            values.append(value)

    if settings_updates:
        values.append(user_id)
        db.execute(f"UPDATE settings SET {', '.join(settings_updates)} WHERE user_id = ?", values)

    return row_to_settings(get_settings(db, user_id))
