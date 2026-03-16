from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..config import settings
from ..deps import get_connection
from ..models import AuthResponse, LoginRequest, RefreshRequest, SignupRequest
from ..services.rate_limit import SlidingWindowRateLimiter
from ..services.repository import (
    create_user,
    get_settings,
    get_user_by_email,
    get_user_by_id,
    is_refresh_token_valid,
    revoke_refresh_token,
    row_to_settings,
    row_to_user,
    store_refresh_token,
)
from ..services.security import create_access_token, create_refresh_token, hash_password, iso_now, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
rate_limiter = SlidingWindowRateLimiter(settings.auth_rate_limit, settings.auth_rate_window_seconds)


def _client_key(request: Request, suffix: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{suffix}"


def _build_auth_response(db: sqlite3.Connection, user_id: int) -> AuthResponse:
    access_token, access_expiry = create_access_token(user_id)
    refresh_token, refresh_expiry = create_refresh_token(user_id)
    now = datetime.now(UTC)
    store_refresh_token(
        db,
        user_id=user_id,
        token=refresh_token,
        expires_at=refresh_expiry.isoformat(),
        created_at=iso_now(),
    )

    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    settings_row = get_settings(db, user_id)
    return AuthResponse(
        tokens={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": max(1, int((access_expiry - now).total_seconds())),
        },
        user=row_to_user(user),
        settings=row_to_settings(settings_row),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, request: Request, db: sqlite3.Connection = Depends(get_connection)) -> AuthResponse:
    if not rate_limiter.allow(_client_key(request, "signup")):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many signup attempts.")

    if get_user_by_email(db, payload.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")

    user_id = create_user(
        db,
        email=payload.email,
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        created_at=iso_now(),
    )
    return _build_auth_response(db, user_id)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, db: sqlite3.Connection = Depends(get_connection)) -> AuthResponse:
    if not rate_limiter.allow(_client_key(request, "login")):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts.")

    user = get_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    return _build_auth_response(db, int(user["id"]))


@router.post("/refresh", response_model=AuthResponse)
def refresh_session(payload: RefreshRequest, db: sqlite3.Connection = Depends(get_connection)) -> AuthResponse:
    try:
        token_payload = jwt.decode(payload.refresh_token, settings.refresh_token_secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token.") from error

    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token type.")

    try:
        user_id = int(token_payload["sub"])
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token subject.") from error

    if not is_refresh_token_valid(db, user_id=user_id, token=payload.refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or expired.")

    revoke_refresh_token(db, token=payload.refresh_token)
    return _build_auth_response(db, user_id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(payload: RefreshRequest, db: sqlite3.Connection = Depends(get_connection)) -> Response:
    revoke_refresh_token(db, token=payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
