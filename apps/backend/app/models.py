from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

#rules for req res models for for authentication and stuff
class SignupRequest(BaseModel):
    email: str
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or "." not in value.rsplit("@", 1)[-1]:
            raise ValueError("A valid email address is required.")
        return value


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=24)


class UserProfileResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: str | None
    avatar_url: str | None
    bio: str | None
    language: Literal["en", "hi"]
    created_at: str


class SettingsResponse(BaseModel):
    language: Literal["en", "hi"] = "en"
    reminder_interval_minutes: int = Field(default=20, ge=5, le=60)
    notifications_enabled: bool = True
    camera_enabled: bool = True
    posture_sensitivity: float = Field(default=0.62, ge=0.3, le=0.95)
    launch_on_startup: bool = False


class AuthTokensResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


class AuthResponse(BaseModel):
    tokens: AuthTokensResponse
    user: UserProfileResponse
    settings: SettingsResponse


class ProfileUpdateRequest(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=32)
    full_name: str | None = Field(default=None, max_length=64)
    avatar_url: str | None = Field(default=None, max_length=512)
    bio: str | None = Field(default=None, max_length=280)
    language: Literal["en", "hi"] | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class SettingsUpdateRequest(BaseModel):
    language: Literal["en", "hi"] | None = None
    reminder_interval_minutes: int | None = Field(default=None, ge=5, le=60)
    notifications_enabled: bool | None = None
    camera_enabled: bool | None = None
    posture_sensitivity: float | None = Field(default=None, ge=0.3, le=0.95)
    launch_on_startup: bool | None = None


class SessionTickRequest(BaseModel):
    elapsed_seconds: int = Field(ge=1, le=300)
    source: Literal["foreground", "background"] = "foreground"


class BlinkEventRequest(BaseModel):
    count: int = Field(ge=1, le=300)
    bucket_start: str


class PostureEventRequest(BaseModel):
    severity: Literal["low", "medium", "high"]
    message: str = Field(min_length=1, max_length=120)
    occurred_at: str
    details: "PostureDetailsModel | None" = None


class PostureMetricsModel(BaseModel):
    roll_degrees: float
    roll_delta_degrees: float
    vertical_ratio: float
    vertical_delta: float
    center_offset_ratio: float
    center_delta: float
    lean_ratio: float
    lean_delta: float
    shoulder_roll_degrees: float = 0.0
    shoulder_roll_delta_degrees: float = 0.0
    shoulder_neck_ratio: float = 0.0
    shoulder_neck_delta: float = 0.0
    score: float


class PostureDetailsModel(BaseModel):
    baseline_ready: bool
    reasons: list[str]
    metrics: PostureMetricsModel


class CoachStatusResponse(BaseModel):
    available: bool
    model: str | None = None
    note: str


class PostureCoachLocalContextModel(BaseModel):
    posture_state: Literal["good", "warning", "unknown"] = "unknown"
    reasons: list[str] = Field(default_factory=list)
    metrics: PostureMetricsModel | None = None


class PostureCoachReviewRequest(BaseModel):
    image_data_url: str = Field(min_length=32, max_length=2_500_000)
    local_context: PostureCoachLocalContextModel | None = None


class PostureCoachReviewResponse(BaseModel):
    reviewed_at: str
    model: str
    posture_label: Literal[
        "aligned",
        "mild_forward_head",
        "slumped_forward",
        "asymmetrical_load",
        "temporary_non_desk_pose",
        "unclear",
    ]
    severity: Literal["good", "mild", "moderate"]
    confidence: float = Field(ge=0, le=1)
    should_trigger_alert: bool
    desk_pose: Literal["neutral_desk_pose", "temporary_non_desk_pose", "unclear"]
    camera_angle_limited: bool
    reasons: list[str] = Field(default_factory=list)
    coaching: str = Field(min_length=1, max_length=240)
    wellness_note: str = Field(min_length=1, max_length=160)


class ReminderEventRequest(BaseModel):
    occurred_at: str
    kind: str = Field(default="20-20-20", max_length=32)


class BreakEventRequest(BaseModel):
    started_at: str
    ended_at: str
    duration_seconds: int = Field(ge=1, le=600)
    initiated_by: Literal["auto", "manual"]


class DailyMetricPoint(BaseModel):
    date: str
    total_screen_time_seconds: int
    total_breaks: int
    total_alerts: int
    posture_alerts: int
    total_blinks: int


class BreakEventResponse(BaseModel):
    id: int
    started_at: str
    ended_at: str
    duration_seconds: int
    initiated_by: Literal["auto", "manual"]


class PostureEventResponse(BaseModel):
    id: int
    created_at: str
    severity: Literal["low", "medium", "high"]
    message: str
    details: PostureDetailsModel | None = None


class BlinkBucketResponse(BaseModel):
    bucket_start: str
    blink_count: int


class AnalyticsSummaryResponse(BaseModel):
    today: DailyMetricPoint | None
    streak_days: int
    totals: dict[str, int]
    history: list[DailyMetricPoint]
    posture_events: list[PostureEventResponse]
    break_events: list[BreakEventResponse]
    blink_buckets: list[BlinkBucketResponse]
