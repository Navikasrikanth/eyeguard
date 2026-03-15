from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def make_client(tmp_path: Path) -> TestClient:
    os.environ["EYEGUARD_DB_PATH"] = str(tmp_path / "test.sqlite3")
    os.environ["EYEGUARD_DATA_DIR"] = str(tmp_path)

    modules_to_clear = [name for name in sys.modules if name == "app" or name.startswith("app.")]
    for name in modules_to_clear:
        sys.modules.pop(name, None)

    main = importlib.import_module("app.main")
    db = importlib.import_module("app.db")
    db.init_db()
    return TestClient(main.app)


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_signup_login_and_user_isolation(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    first = client.post(
        "/api/auth/signup",
        json={"email": "first@example.com", "username": "first", "password": "Secret123"},
    )
    assert first.status_code == 201, first.text
    first_data = first.json()

    second = client.post(
        "/api/auth/signup",
        json={"email": "second@example.com", "username": "second", "password": "Secret123"},
    )
    assert second.status_code == 201, second.text
    second_data = second.json()

    metrics_response = client.post(
        "/api/metrics/session-tick",
        headers=auth_headers(first_data["tokens"]["access_token"]),
        json={"elapsed_seconds": 120, "source": "foreground"},
    )
    assert metrics_response.status_code == 202, metrics_response.text

    analytics_first = client.get(
        "/api/analytics/summary",
        headers=auth_headers(first_data["tokens"]["access_token"]),
    )
    analytics_second = client.get(
        "/api/analytics/summary",
        headers=auth_headers(second_data["tokens"]["access_token"]),
    )

    assert analytics_first.status_code == 200
    assert analytics_second.status_code == 200
    assert analytics_first.json()["totals"]["screenTimeSeconds"] == 120
    assert analytics_second.json()["totals"]["screenTimeSeconds"] == 0


def test_ai_coach_status_is_unavailable_without_api_key(tmp_path: Path) -> None:
    os.environ.pop("OPENAI_API_KEY", None)
    client = make_client(tmp_path)
    signup = client.post(
        "/api/auth/signup",
        json={"email": "coach@example.com", "username": "coach", "password": "Secret123"},
    )
    token = signup.json()["tokens"]["access_token"]

    status_response = client.get("/api/coach/status", headers=auth_headers(token))
    assert status_response.status_code == 200, status_response.text
    assert status_response.json()["available"] is False

    review_response = client.post(
        "/api/coach/posture-review",
        headers=auth_headers(token),
        json={"image_data_url": "data:image/jpeg;base64,ZmFrZQ=="},
    )
    assert review_response.status_code == 503, review_response.text


def test_break_and_posture_events_persist(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    signup = client.post(
        "/api/auth/signup",
        json={"email": "tester@example.com", "username": "tester", "password": "Secret123"},
    )
    token = signup.json()["tokens"]["access_token"]

    reminder = client.post(
        "/api/metrics/reminder",
        headers=auth_headers(token),
        json={"occurred_at": "2026-03-14T12:00:00+00:00", "kind": "20-20-20"},
    )
    posture = client.post(
        "/api/metrics/posture",
        headers=auth_headers(token),
        json={
            "severity": "high",
            "message": "correct your posture",
            "occurred_at": "2026-03-14T12:01:00+00:00",
            "details": {
                "baseline_ready": True,
                "reasons": ["head dropped below neutral", "slumped forward"],
                "metrics": {
                    "roll_degrees": 1.2,
                    "roll_delta_degrees": 4.4,
                    "vertical_ratio": 0.41,
                    "vertical_delta": 0.05,
                    "center_offset_ratio": 0.03,
                    "center_delta": 0.01,
                    "lean_ratio": 0.46,
                    "lean_delta": 0.08,
                    "shoulder_roll_degrees": 2.4,
                    "shoulder_roll_delta_degrees": 1.8,
                    "shoulder_neck_ratio": 0.28,
                    "shoulder_neck_delta": 0.09,
                    "score": 0.67,
                },
            },
        },
    )
    blink = client.post(
        "/api/metrics/blink",
        headers=auth_headers(token),
        json={"count": 14, "bucket_start": "2026-03-14T12:01:00+00:00"},
    )
    break_event = client.post(
        "/api/metrics/break",
        headers=auth_headers(token),
        json={
            "started_at": "2026-03-14T12:20:00+00:00",
            "ended_at": "2026-03-14T12:20:20+00:00",
            "duration_seconds": 20,
            "initiated_by": "auto",
        },
    )

    assert reminder.status_code == 202
    assert posture.status_code == 202
    assert blink.status_code == 202
    assert break_event.status_code == 202

    analytics = client.get("/api/analytics/summary", headers=auth_headers(token))
    payload = analytics.json()
    assert payload["totals"]["alerts"] == 2
    assert payload["totals"]["postureAlerts"] == 1
    assert payload["totals"]["breaks"] == 1
    assert payload["totals"]["blinks"] == 14
    assert payload["posture_events"][0]["message"] == "correct your posture"
    assert payload["posture_events"][0]["details"]["metrics"]["shoulder_neck_delta"] == 0.09


def test_legacy_posture_metrics_are_backfilled_for_dashboard(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    signup = client.post(
        "/api/auth/signup",
        json={"email": "legacy@example.com", "username": "legacy", "password": "Secret123"},
    )
    token = signup.json()["tokens"]["access_token"]
    app_db = importlib.import_module("app.db")

    with app_db.get_db() as db:
        db.execute(
            """
            INSERT INTO posture_events (user_id, created_at, severity, message, details_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                signup.json()["user"]["id"],
                "2026-03-14T12:01:00+00:00",
                "high",
                "correct your posture",
                json.dumps(
                    {
                        "baseline_ready": True,
                        "reasons": ["head dropped below neutral"],
                        "metrics": {
                            "roll_degrees": 1.2,
                            "roll_delta_degrees": 2.5,
                            "vertical_ratio": 0.41,
                            "vertical_delta": 0.05,
                            "center_offset_ratio": 0.03,
                            "center_delta": 0.01,
                            "lean_ratio": 0.46,
                            "lean_delta": 0.08,
                            "score": 0.51,
                        },
                    }
                ),
            ),
        )

    analytics = client.get("/api/analytics/summary", headers=auth_headers(token))
    assert analytics.status_code == 200, analytics.text
    metrics = analytics.json()["posture_events"][0]["details"]["metrics"]
    assert metrics["shoulder_roll_degrees"] == 0.0
    assert metrics["shoulder_neck_delta"] == 0.0
