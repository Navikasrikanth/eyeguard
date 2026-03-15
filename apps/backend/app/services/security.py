from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from ..config import settings


def utc_now() -> datetime:
    return datetime.now(UTC)


def iso_now() -> str:
    return utc_now().isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def build_token(
    *,
    user_id: int,
    token_type: str,
    secret: str,
    expires_delta: timedelta,
) -> tuple[str, datetime]:
    expires_at = utc_now() + expires_delta
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "exp": expires_at,
        "iat": utc_now(),
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token, expires_at


def create_access_token(user_id: int) -> tuple[str, datetime]:
    return build_token(
        user_id=user_id,
        token_type="access",
        secret=settings.access_token_secret,
        expires_delta=timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(user_id: int) -> tuple[str, datetime]:
    return build_token(
        user_id=user_id,
        token_type="refresh",
        secret=settings.refresh_token_secret,
        expires_delta=timedelta(days=settings.refresh_token_days),
    )


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.access_token_secret, algorithms=["HS256"])


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
