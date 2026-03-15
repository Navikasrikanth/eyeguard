from __future__ import annotations

import math
import threading
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BLINK_CLOSE_THRESHOLD = 0.17
BLINK_OPEN_THRESHOLD = 0.22
CALIBRATION_SAMPLE_TARGET = 45
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263
NOSE_TIP = 1
FOREHEAD = 10
CHIN = 152
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12


class Point(BaseModel):
    x: float
    y: float
    z: float = 0.0
    visibility: float | None = None


class PostureMetricsModel(BaseModel):
    roll_degrees: float
    roll_delta_degrees: float
    vertical_ratio: float
    vertical_delta: float
    center_offset_ratio: float
    center_delta: float
    lean_ratio: float
    lean_delta: float
    shoulder_roll_degrees: float
    shoulder_roll_delta_degrees: float
    shoulder_neck_ratio: float
    shoulder_neck_delta: float
    score: float


class PostureDetailsModel(BaseModel):
    baseline_ready: bool
    reasons: list[str]
    metrics: PostureMetricsModel


class BlinkBucketResponse(BaseModel):
    bucket_start: str
    blink_count: int


class PostureEventResponse(BaseModel):
    occurred_at: str
    severity: str
    message: str
    details: PostureDetailsModel | None = None


class VisionSessionStartRequest(BaseModel):
    posture_sensitivity: float = Field(default=0.62, ge=0.3, le=0.95)


class VisionSessionStateResponse(BaseModel):
    active: bool
    ready: bool
    posture_state: str
    blink_count: int
    posture_reasons: list[str]
    posture_metrics: PostureMetricsModel | None = None
    note: str


class VisionSessionStopResponse(BaseModel):
    active: bool
    blink_count: int
    blink_buckets: list[BlinkBucketResponse]
    posture_events: list[PostureEventResponse]
    note: str


app = FastAPI(title="EyeGuard Vision Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null", "file://"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def distance(a: Point, b: Point) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def midpoint(a: Point, b: Point) -> Point:
    return Point(x=(a.x + b.x) / 2, y=(a.y + b.y) / 2)


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def contribution(delta: float, threshold: float) -> float:
    return max(0.0, delta / threshold - 1.0)


def eye_aspect_ratio(points: list[Point]) -> float:
    p1, p2, p3, p4, p5, p6 = points
    vertical = distance(p2, p6) + distance(p3, p5)
    horizontal = 2 * distance(p1, p4)
    return 0.0 if horizontal == 0 else vertical / horizontal


def average_ear(landmarks: list[Point]) -> float:
    left = eye_aspect_ratio([landmarks[index] for index in LEFT_EYE])
    right = eye_aspect_ratio([landmarks[index] for index in RIGHT_EYE])
    return (left + right) / 2


def has_reliable_pose_point(point: Point | None) -> bool:
    return bool(point and (point.visibility is None or point.visibility > 0.45))


def tolerance_scale_from_sensitivity(sensitivity: float) -> float:
    return clamp(1 + (0.62 - sensitivity), 0.72, 1.35)


@dataclass
class PostureSnapshot:
    roll_degrees: float
    vertical_ratio: float
    center_offset_ratio: float
    lean_ratio: float
    face_width: float
    face_height: float
    shoulder_roll_degrees: float | None
    shoulder_neck_ratio: float | None
    upper_body_tracked: bool


@dataclass
class PostureBaseline:
    roll_degrees: float
    vertical_ratio: float
    center_offset_ratio: float
    lean_ratio: float
    face_width: float
    face_height: float
    shoulder_roll_degrees: float | None
    shoulder_neck_ratio: float | None
    upper_body_tracked: bool
    sample_count: int
    shoulder_sample_count: int


def extract_posture_features(face_landmarks: list[Point], pose_landmarks: list[Point] | None) -> PostureSnapshot:
    left_eye = face_landmarks[LEFT_EYE_OUTER]
    right_eye = face_landmarks[RIGHT_EYE_OUTER]
    nose = face_landmarks[NOSE_TIP]
    forehead = face_landmarks[FOREHEAD]
    chin = face_landmarks[CHIN]
    eye_mid = midpoint(left_eye, right_eye)
    face_width = max(distance(left_eye, right_eye), 0.0001)
    face_height = max(distance(forehead, chin), face_width)
    roll_radians = math.atan2(right_eye.y - left_eye.y, right_eye.x - left_eye.x)
    left_shoulder = pose_landmarks[LEFT_SHOULDER] if pose_landmarks and len(pose_landmarks) > LEFT_SHOULDER else None
    right_shoulder = pose_landmarks[RIGHT_SHOULDER] if pose_landmarks and len(pose_landmarks) > RIGHT_SHOULDER else None
    upper_body_tracked = has_reliable_pose_point(left_shoulder) and has_reliable_pose_point(right_shoulder)

    shoulder_roll_degrees = None
    shoulder_neck_ratio = None
    if upper_body_tracked and left_shoulder and right_shoulder:
        shoulder_mid = midpoint(left_shoulder, right_shoulder)
        shoulder_width = max(distance(left_shoulder, right_shoulder), face_width * 0.55, 0.0001)
        shoulder_roll_radians = math.atan2(
            right_shoulder.y - left_shoulder.y,
            right_shoulder.x - left_shoulder.x,
        )
        shoulder_roll_degrees = (shoulder_roll_radians * 180) / math.pi
        shoulder_neck_ratio = clamp((shoulder_mid.y - chin.y) / shoulder_width, 0, 3)

    return PostureSnapshot(
        roll_degrees=(roll_radians * 180) / math.pi,
        vertical_ratio=(nose.y - eye_mid.y) / face_height,
        center_offset_ratio=abs(nose.x - eye_mid.x) / face_width,
        lean_ratio=face_width / face_height,
        face_width=face_width,
        face_height=face_height,
        shoulder_roll_degrees=shoulder_roll_degrees,
        shoulder_neck_ratio=shoulder_neck_ratio,
        upper_body_tracked=upper_body_tracked,
    )


def build_baseline(samples: list[PostureSnapshot]) -> PostureBaseline:
    count = max(len(samples), 1)
    shoulder_samples = [sample for sample in samples if sample.upper_body_tracked and sample.shoulder_roll_degrees is not None and sample.shoulder_neck_ratio is not None]
    shoulder_count = len(shoulder_samples)
    return PostureBaseline(
        roll_degrees=sum(sample.roll_degrees for sample in samples) / count,
        vertical_ratio=sum(sample.vertical_ratio for sample in samples) / count,
        center_offset_ratio=sum(sample.center_offset_ratio for sample in samples) / count,
        lean_ratio=sum(sample.lean_ratio for sample in samples) / count,
        face_width=sum(sample.face_width for sample in samples) / count,
        face_height=sum(sample.face_height for sample in samples) / count,
        shoulder_roll_degrees=(
            sum(sample.shoulder_roll_degrees or 0 for sample in shoulder_samples) / shoulder_count if shoulder_count else None
        ),
        shoulder_neck_ratio=(
            sum(sample.shoulder_neck_ratio or 0 for sample in shoulder_samples) / shoulder_count if shoulder_count else None
        ),
        upper_body_tracked=shoulder_count > 0,
        sample_count=len(samples),
        shoulder_sample_count=shoulder_count,
    )


def assess_posture(
    current: PostureSnapshot,
    baseline: PostureBaseline,
    sensitivity: float,
) -> tuple[list[str], PostureMetricsModel]:
    tolerance_scale = tolerance_scale_from_sensitivity(sensitivity)
    roll_delta = abs(current.roll_degrees - baseline.roll_degrees)
    vertical_drift = current.vertical_ratio - baseline.vertical_ratio
    vertical_delta = abs(vertical_drift)
    center_delta = abs(current.center_offset_ratio - baseline.center_offset_ratio)
    lean_delta = abs(current.lean_ratio - baseline.lean_ratio)
    shoulder_tracked = (
        current.upper_body_tracked
        and baseline.upper_body_tracked
        and current.shoulder_roll_degrees is not None
        and current.shoulder_neck_ratio is not None
        and baseline.shoulder_roll_degrees is not None
        and baseline.shoulder_neck_ratio is not None
    )
    current_shoulder_roll = current.shoulder_roll_degrees or 0.0
    baseline_shoulder_roll = baseline.shoulder_roll_degrees or 0.0
    current_shoulder_neck = current.shoulder_neck_ratio or 0.0
    baseline_shoulder_neck = baseline.shoulder_neck_ratio or 0.0
    shoulder_roll_delta = abs(current_shoulder_roll - baseline_shoulder_roll) if shoulder_tracked else 0.0
    shoulder_neck_delta = max(0.0, baseline_shoulder_neck - current_shoulder_neck) if shoulder_tracked else 0.0
    reasons: list[str] = []

    if roll_delta > 7 * tolerance_scale and "head tilt" not in reasons:
        reasons.append("head tilt")
    if vertical_drift > 0.032 * tolerance_scale and "head dropped below neutral" not in reasons:
        reasons.append("head dropped below neutral")
    elif vertical_drift < -0.04 * tolerance_scale and "chin lifted above neutral" not in reasons:
        reasons.append("chin lifted above neutral")
    if center_delta > 0.05 * tolerance_scale and "head shifted off-center" not in reasons:
        reasons.append("head shifted off-center")
    if lean_delta > 0.11 * tolerance_scale:
        reason = "leaning toward screen" if current.lean_ratio > baseline.lean_ratio else "leaning away from screen"
        if reason not in reasons:
            reasons.append(reason)
    if shoulder_tracked and shoulder_roll_delta > 6 * tolerance_scale and "uneven shoulders" not in reasons:
        reasons.append("uneven shoulders")
    if shoulder_tracked and shoulder_neck_delta > 0.06 * tolerance_scale and "slumped shoulders / compressed neck" not in reasons:
        reasons.append("slumped shoulders / compressed neck")
    slump_composite = max(0.0, vertical_drift) + shoulder_neck_delta + (lean_delta * 0.65 if current.lean_ratio > baseline.lean_ratio else 0.0)
    if slump_composite > 0.08 * tolerance_scale and "slumped forward" not in reasons:
        reasons.append("slumped forward")

    score = (
        0.22 * contribution(roll_delta, 5.4 * tolerance_scale)
        + 0.24 * contribution(vertical_delta, 0.028 * tolerance_scale)
        + 0.10 * contribution(center_delta, 0.034 * tolerance_scale)
        + 0.14 * contribution(lean_delta, 0.075 * tolerance_scale)
        + 0.12 * contribution(shoulder_roll_delta, 4.8 * tolerance_scale)
        + 0.24 * contribution(shoulder_neck_delta, 0.04 * tolerance_scale)
        + (0.18 if len(reasons) >= 2 else 0.0)
        + (0.08 if "slumped forward" in reasons else 0.0)
    )

    return reasons, PostureMetricsModel(
        roll_degrees=round(current.roll_degrees, 2),
        roll_delta_degrees=round(roll_delta, 2),
        vertical_ratio=round(current.vertical_ratio, 4),
        vertical_delta=round(vertical_delta, 4),
        center_offset_ratio=round(current.center_offset_ratio, 4),
        center_delta=round(center_delta, 4),
        lean_ratio=round(current.lean_ratio, 4),
        lean_delta=round(lean_delta, 4),
        shoulder_roll_degrees=round(current_shoulder_roll, 2),
        shoulder_roll_delta_degrees=round(shoulder_roll_delta, 2),
        shoulder_neck_ratio=round(current_shoulder_neck, 4),
        shoulder_neck_delta=round(shoulder_neck_delta, 4),
        score=round(score, 3),
    )


class VisionMonitor:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._active = False
        self._ready = False
        self._error: str | None = None
        self._note = "Background vision service is idle."
        self._blink_closed = False
        self._blink_count = 0
        self._blink_buckets: dict[str, int] = defaultdict(int)
        self._posture_events: list[PostureEventResponse] = []
        self._posture_state = "unknown"
        self._posture_reasons: list[str] = []
        self._posture_metrics: PostureMetricsModel | None = None
        self._last_alert_at = 0.0
        self._baseline_samples: list[PostureSnapshot] = []
        self._baseline: PostureBaseline | None = None
        self._smoothed_score = 0.0
        self._sensitivity = 0.62

    def start(self, sensitivity: float) -> None:
        with self._lock:
            if self._active:
                return
            self._active = True
            self._ready = False
            self._error = None
            self._note = "Starting background vision monitoring."
            self._blink_closed = False
            self._blink_count = 0
            self._blink_buckets = defaultdict(int)
            self._posture_events = []
            self._posture_state = "unknown"
            self._posture_reasons = []
            self._posture_metrics = None
            self._last_alert_at = 0.0
            self._baseline_samples = []
            self._baseline = None
            self._smoothed_score = 0.0
            self._sensitivity = sensitivity
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()

    def stop(self) -> VisionSessionStopResponse:
        thread: threading.Thread | None
        with self._lock:
            thread = self._thread
            was_active = self._active
            self._active = False
            self._stop_event.set()
        if thread and thread.is_alive():
            thread.join(timeout=6)
        with self._lock:
            summary = VisionSessionStopResponse(
                active=False,
                blink_count=self._blink_count,
                blink_buckets=[
                    BlinkBucketResponse(bucket_start=bucket_start, blink_count=count)
                    for bucket_start, count in sorted(self._blink_buckets.items())
                ],
                posture_events=self._posture_events.copy(),
                note=self._error or ("Background vision monitoring stopped." if was_active else "Background vision monitoring was not active."),
            )
            self._thread = None
            self._stop_event.clear()
            self._note = "Background vision service is idle."
            return summary

    def state(self) -> VisionSessionStateResponse:
        with self._lock:
            return VisionSessionStateResponse(
                active=self._active,
                ready=self._ready,
                posture_state=self._posture_state,
                blink_count=self._blink_count,
                posture_reasons=self._posture_reasons.copy(),
                posture_metrics=self._posture_metrics,
                note=self._error or self._note,
            )

    def _set_error(self, message: str) -> None:
        with self._lock:
            self._error = message
            self._note = message
            self._ready = False

    def _record_blink(self) -> None:
        bucket = datetime.now(UTC).replace(second=0, microsecond=0).isoformat()
        with self._lock:
            self._blink_count += 1
            self._blink_buckets[bucket] += 1

    def _record_posture_event(self, reasons: list[str], metrics: PostureMetricsModel) -> None:
        occurred_at = datetime.now(UTC).isoformat()
        event = PostureEventResponse(
            occurred_at=occurred_at,
            severity="high",
            message="correct your posture",
            details=PostureDetailsModel(
                baseline_ready=True,
                reasons=reasons,
                metrics=metrics,
            ),
        )
        with self._lock:
            self._posture_events.append(event)
            self._last_alert_at = time.time()

    def _run_loop(self) -> None:
        try:
            import cv2
            import mediapipe as mp
        except Exception as error:  # pragma: no cover - dependency/runtime specific
            self._set_error(f"Vision dependencies are missing: {error}")
            return

        face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=0,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        capture = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        if not capture.isOpened():
            capture = cv2.VideoCapture(0)

        if not capture.isOpened():  # pragma: no cover - hardware specific
            self._set_error("Unable to open the webcam for background monitoring.")
            face_mesh.close()
            pose.close()
            return

        with self._lock:
            self._ready = True
            self._note = "Background vision monitoring is active."

        try:
            while not self._stop_event.is_set():
                ok, frame = capture.read()
                if not ok:
                    time.sleep(0.12)
                    continue

                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                face_result = face_mesh.process(frame_rgb)
                pose_result = pose.process(frame_rgb)

                if not face_result.multi_face_landmarks:
                    with self._lock:
                        self._posture_state = "unknown"
                        self._posture_reasons = []
                        self._note = "No face detected in background monitoring."
                    time.sleep(0.03)
                    continue

                face_landmarks = [
                    Point(x=landmark.x, y=landmark.y, z=landmark.z)
                    for landmark in face_result.multi_face_landmarks[0].landmark
                ]
                pose_landmarks = None
                if pose_result.pose_landmarks:
                    pose_landmarks = [
                        Point(
                            x=landmark.x,
                            y=landmark.y,
                            z=landmark.z,
                            visibility=float(landmark.visibility),
                        )
                        for landmark in pose_result.pose_landmarks.landmark
                    ]

                ear = average_ear(face_landmarks)
                features = extract_posture_features(face_landmarks, pose_landmarks)

                if ear < BLINK_CLOSE_THRESHOLD and not self._blink_closed:
                    self._blink_closed = True
                    self._record_blink()
                elif ear > BLINK_OPEN_THRESHOLD:
                    self._blink_closed = False

                if self._baseline is None:
                    self._baseline_samples.append(features)
                    if len(self._baseline_samples) >= CALIBRATION_SAMPLE_TARGET:
                        self._baseline = build_baseline(self._baseline_samples)
                        with self._lock:
                            self._posture_state = "good"
                            self._note = "Background posture baseline captured."
                    time.sleep(0.03)
                    continue

                reasons, metrics = assess_posture(features, self._baseline, self._sensitivity)
                self._smoothed_score = self._smoothed_score * 0.84 + metrics.score * 0.16
                metrics.score = round(self._smoothed_score, 3)

                with self._lock:
                    previous_state = self._posture_state
                    next_state = previous_state
                    if previous_state != "warning" and metrics.score > 0.38 and reasons:
                        next_state = "warning"
                    elif previous_state == "warning" and metrics.score < 0.18:
                        next_state = "good"
                    elif previous_state == "unknown":
                        next_state = "warning" if reasons and metrics.score > 0.38 else "good"
                    self._posture_state = next_state
                    self._posture_reasons = reasons
                    self._posture_metrics = metrics
                    self._note = "Background vision monitoring is active."

                if self._posture_state == "warning" and (time.time() - self._last_alert_at > 15):
                    self._record_posture_event(reasons, metrics)

                time.sleep(0.03)
        finally:
            capture.release()
            face_mesh.close()
            pose.close()


monitor = VisionMonitor()


@app.get("/health")
def health() -> dict[str, object]:
    state = monitor.state()
    return {
        "status": "ok",
        "active": state.active,
        "ready": state.ready,
        "note": state.note,
    }


@app.get("/session/state", response_model=VisionSessionStateResponse)
def session_state() -> VisionSessionStateResponse:
    return monitor.state()


@app.post("/session/start", response_model=VisionSessionStateResponse)
def session_start(payload: VisionSessionStartRequest) -> VisionSessionStateResponse:
    try:
        monitor.start(payload.posture_sensitivity)
        time.sleep(0.25)
        return monitor.state()
    except Exception as error:  # pragma: no cover - runtime specific
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)) from error


@app.post("/session/stop", response_model=VisionSessionStopResponse)
def session_stop() -> VisionSessionStopResponse:
    return monitor.stop()
