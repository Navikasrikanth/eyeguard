from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
#global variables needed for app

@dataclass(frozen=True)
class Settings:
    app_name: str = "EyeGuard API"
    api_prefix: str = "/api"
    data_dir: Path = Path(os.getenv("EYEGUARD_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
    db_path: Path = Path(os.getenv("EYEGUARD_DB_PATH", Path(__file__).resolve().parents[1] / "data" / "eyeguard.sqlite3"))
    access_token_secret: str = os.getenv("EYE_ACCESS_SECRET", "dev-access-secret-change-me")
    refresh_token_secret: str = os.getenv("EYE_REFRESH_SECRET", "dev-refresh-secret-change-me")
    access_token_minutes: int = int(os.getenv("EYE_ACCESS_MINUTES", "30"))
    refresh_token_days: int = int(os.getenv("EYE_REFRESH_DAYS", "14"))
    auth_rate_limit: int = int(os.getenv("EYE_AUTH_RATE_LIMIT", "10"))
    auth_rate_window_seconds: int = int(os.getenv("EYE_AUTH_RATE_WINDOW_SECONDS", "60"))
    ai_provider: str = os.getenv("AI_PROVIDER", "openai").strip().lower()
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    openai_posture_model: str = os.getenv("OPENAI_POSTURE_MODEL", "gpt-4o-mini")
    openai_timeout_seconds: float = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "25"))
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    gemini_base_url: str = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
    gemini_posture_model: str = os.getenv("GEMINI_POSTURE_MODEL", "gemini-2.5-flash")


settings = Settings()
