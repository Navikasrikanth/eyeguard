import type { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PostureDetails, PostureMetrics } from "@eyeguard/types";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import {
  assessPosture,
  averageEar,
  buildPostureBaseline,
  extractPostureFeatures,
  type Point,
  type PostureBaseline,
  type PostureFeatureSnapshot
} from "@/features/monitoring/heuristics";

type MonitoringEngineOptions = {
  enabled: boolean;
  postureSensitivity: number;
  onBlink: () => void;
  onPostureAlert: (details: PostureDetails) => void;
  pausedForBackground?: boolean;
};

type MonitoringState = {
  cameraState: "pending" | "ready" | "denied" | "unsupported" | "error";
  postureState: "good" | "warning" | "unknown";
  blinkCount: number;
  postureAlertVisible: boolean;
  postureReasons: string[];
  postureMetrics: PostureMetrics | null;
  calibrationState: "needed" | "calibrating" | "ready";
  calibrationProgress: number;
  lastAlertAt: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  helperMessage: string;
  recalibrate: () => void;
};

const BLINK_CLOSE_THRESHOLD = 0.17;
const BLINK_OPEN_THRESHOLD = 0.22;
const CALIBRATION_SAMPLE_TARGET = 45;
const CAMERA_FRAME_TIMEOUT_MS = 2500;

async function waitForFirstVideoFrame(video: HTMLVideoElement): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("No video frames received from the camera."));
    }, CAMERA_FRAME_TIMEOUT_MS);

    const finish = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    const fail = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("No video frames received from the camera."));
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      finish();
      return;
    }

    const frameVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };

    if (typeof frameVideo.requestVideoFrameCallback === "function") {
      const handle = frameVideo.requestVideoFrameCallback(() => finish());
      window.setTimeout(() => {
        frameVideo.cancelVideoFrameCallback?.(handle);
      }, CAMERA_FRAME_TIMEOUT_MS);
      return;
    }

    const poll = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        finish();
        return;
      }
      if (document.visibilityState === "hidden") {
        fail();
        return;
      }
      window.requestAnimationFrame(poll);
    };

    window.requestAnimationFrame(poll);
  });
}

function metricsChanged(previous: PostureMetrics | null, next: PostureMetrics): boolean {
  if (!previous) {
    return true;
  }
  return (
    Math.abs(previous.score - next.score) > 0.05 ||
    Math.abs(previous.rollDeltaDegrees - next.rollDeltaDegrees) > 1 ||
    Math.abs(previous.verticalDelta - next.verticalDelta) > 0.015 ||
    Math.abs(previous.centerDelta - next.centerDelta) > 0.015 ||
    Math.abs(previous.leanDelta - next.leanDelta) > 0.03 ||
    Math.abs(previous.shoulderRollDeltaDegrees - next.shoulderRollDeltaDegrees) > 1.25 ||
    Math.abs(previous.shoulderNeckDelta - next.shoulderNeckDelta) > 0.02
  );
}

export function useMonitoringEngine({
  enabled,
  postureSensitivity,
  onBlink,
  onPostureAlert,
  pausedForBackground = false
}: MonitoringEngineOptions): MonitoringState {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isBlinkClosedRef = useRef(false);
  const lastUiAlertAtRef = useRef(0);
  const lastConsoleWarningAtRef = useRef(0);
  const lastMetricsUiAtRef = useRef(0);
  const baselineRef = useRef<PostureBaseline | null>(null);
  const calibrationSamplesRef = useRef<PostureFeatureSnapshot[]>([]);
  const smoothedScoreRef = useRef(0);
  const postureStateRef = useRef<MonitoringState["postureState"]>("unknown");
  const postureReasonsRef = useRef<string[]>([]);
  const postureMetricsRef = useRef<PostureMetrics | null>(null);
  const [cameraState, setCameraState] = useState<MonitoringState["cameraState"]>("pending");
  const [postureState, setPostureState] = useState<MonitoringState["postureState"]>("unknown");
  const [blinkCount, setBlinkCount] = useState(0);
  const [postureReasons, setPostureReasons] = useState<string[]>([]);
  const [postureMetrics, setPostureMetrics] = useState<PostureMetrics | null>(null);
  const [calibrationState, setCalibrationState] = useState<MonitoringState["calibrationState"]>("needed");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [lastAlertAt, setLastAlertAt] = useState<string | null>(null);
  const [helperMessage, setHelperMessage] = useState("Enable your camera to start blink and posture wellness cues.");
  const [recalibrationNonce, setRecalibrationNonce] = useState(0);
  const onBlinkRef = useRef(onBlink);
  const onPostureAlertRef = useRef(onPostureAlert);

  useEffect(() => {
    onBlinkRef.current = onBlink;
    onPostureAlertRef.current = onPostureAlert;
  }, [onBlink, onPostureAlert]);

  useEffect(() => {
    if (pausedForBackground) {
      setHelperMessage("Renderer monitoring is paused while the local background vision service owns the webcam.");
      setCameraState("pending");
      return;
    }
    if (!enabled) {
      setHelperMessage("Camera monitoring is turned off in settings. Timers and reminders remain active.");
      setCameraState("pending");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      setHelperMessage("This device does not support webcam access in the current browser context.");
      return;
    }

    let cancelled = false;
    let faceLandmarker: FaceLandmarker | null = null;
    let poseLandmarker: PoseLandmarker | null = null;

    baselineRef.current = null;
    calibrationSamplesRef.current = [];
    smoothedScoreRef.current = 0;
    postureStateRef.current = "unknown";
    postureReasonsRef.current = [];
    postureMetricsRef.current = null;
    setPostureState("unknown");
    setPostureReasons([]);
    setPostureMetrics(null);
    setCalibrationState("needed");
    setCalibrationProgress(0);

    function updatePostureUi(nextState: MonitoringState["postureState"], nextReasons: string[], nextMetrics: PostureMetrics) {
      const reasonsChanged = postureReasonsRef.current.join("|") !== nextReasons.join("|");
      const stateChanged = postureStateRef.current !== nextState;
      const metricsNeedRefresh = metricsChanged(postureMetricsRef.current, nextMetrics);
      const now = Date.now();
      const timeForRefresh = now - lastMetricsUiAtRef.current > 450;

      if (stateChanged) {
        postureStateRef.current = nextState;
        setPostureState(nextState);
      }

      if (reasonsChanged) {
        postureReasonsRef.current = nextReasons;
        setPostureReasons(nextReasons);
      }

      if (metricsNeedRefresh && (timeForRefresh || stateChanged || reasonsChanged)) {
        postureMetricsRef.current = nextMetrics;
        setPostureMetrics(nextMetrics);
        lastMetricsUiAtRef.current = now;
      }
    }

    function drawGuide(
      video: HTMLVideoElement,
      poorPosture: boolean,
      blinkRatio: number,
      overlayLabel: string,
      overlayMetric: string
    ) {
      const canvas = overlayRef.current;
      if (!canvas) {
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = poorPosture ? "rgba(255, 95, 93, 0.92)" : "rgba(139, 168, 136, 0.88)";
      context.lineWidth = 4;
      context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
      context.fillStyle = "rgba(12, 18, 23, 0.72)";
      context.fillRect(18, 18, 300, 72);
      context.fillStyle = "#f7f5ef";
      context.font = "600 18px 'Segoe UI'";
      context.fillText(overlayLabel, 32, 46);
      context.font = "500 14px 'Segoe UI'";
      context.fillText(`${overlayMetric} | EAR ${blinkRatio.toFixed(2)}`, 32, 66);
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const [videoTrack] = stream.getVideoTracks();
        const video = videoRef.current;
        if (!video) {
          return;
        }

        videoTrack?.addEventListener("mute", () => {
          setCameraState("error");
          setHelperMessage(
            "Camera permission was granted, but the video feed was muted by the device or OS. Check your shutter, privacy key, or Windows camera settings."
          );
          console.warn("[EyeGuard camera] track muted", {
            label: videoTrack.label,
            readyState: videoTrack.readyState,
            settings: videoTrack.getSettings()
          });
        });

        videoTrack?.addEventListener("ended", () => {
          setCameraState("error");
          setHelperMessage("The camera feed ended unexpectedly. Another app or a privacy control may have interrupted it.");
          console.warn("[EyeGuard camera] track ended", {
            label: videoTrack.label,
            readyState: videoTrack.readyState
          });
        });

        video.srcObject = stream;
        await video.play();
        await waitForFirstVideoFrame(video);
        setCameraState("ready");
        setHelperMessage("Hold your normal seated posture for about 2 seconds to calibrate EyeGuard.");

        try {
          const { FaceLandmarker, FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
          const resolver = await FilesetResolver.forVisionTasks(
            import.meta.env.VITE_MEDIAPIPE_WASM_URL ??
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );
          const [createdFaceLandmarker, createdPoseLandmarker] = await Promise.all([
            FaceLandmarker.createFromOptions(resolver, {
              baseOptions: {
                modelAssetPath:
                  import.meta.env.VITE_FACE_LANDMARKER_MODEL_URL ??
                  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
              },
              runningMode: "VIDEO",
              numFaces: 1
            }),
            PoseLandmarker.createFromOptions(resolver, {
              baseOptions: {
                modelAssetPath:
                  import.meta.env.VITE_POSE_LANDMARKER_MODEL_URL ??
                  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
              },
              runningMode: "VIDEO",
              numPoses: 1,
              minPoseDetectionConfidence: 0.55,
              minPosePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            }).catch((error) => {
              console.warn("[EyeGuard posture] upper-body pose model unavailable, using head cues only", error);
              return null;
            })
          ]);
          faceLandmarker = createdFaceLandmarker;
          poseLandmarker = createdPoseLandmarker;
        } catch {
          setHelperMessage(
            "Camera preview is live, but landmark models could not be loaded. Session timers still work."
          );
          return;
        }

        const loop = () => {
          if (cancelled || !faceLandmarker || !videoRef.current) {
            return;
          }

          const timestamp = performance.now();
          const faceResult = faceLandmarker.detectForVideo(videoRef.current, timestamp);
          const poseResult = poseLandmarker?.detectForVideo(videoRef.current, timestamp);
          const landmarks = faceResult.faceLandmarks?.[0] as Point[] | undefined;
          const poseLandmarks = poseResult?.landmarks?.[0] as Point[] | undefined;
          if (landmarks) {
            const ear = averageEar(landmarks);
            const features = extractPostureFeatures(landmarks, poseLandmarks);

            if (ear < BLINK_CLOSE_THRESHOLD && !isBlinkClosedRef.current) {
              isBlinkClosedRef.current = true;
              setBlinkCount((value) => value + 1);
              onBlinkRef.current();
            } else if (ear > BLINK_OPEN_THRESHOLD) {
              isBlinkClosedRef.current = false;
            }

            if (!baselineRef.current) {
              calibrationSamplesRef.current.push(features);
              const progress = Math.min(calibrationSamplesRef.current.length / CALIBRATION_SAMPLE_TARGET, 1);
              setCalibrationState("calibrating");
              setCalibrationProgress(progress);
              setPostureState("unknown");
              drawGuide(videoRef.current, false, ear, `Calibrating ${Math.round(progress * 100)}%`, "Hold neutral posture");

              if (calibrationSamplesRef.current.length >= CALIBRATION_SAMPLE_TARGET) {
                baselineRef.current = buildPostureBaseline(calibrationSamplesRef.current);
                setCalibrationState("ready");
                setCalibrationProgress(1);
                setPostureState("good");
                setHelperMessage(
                  poseLandmarker
                    ? "Posture baseline captured. Recalibrate after changing your chair, desk height, or monitor angle."
                    : "Baseline captured from head cues. Recalibrate after changing your chair, desk height, or monitor angle."
                );
                console.info("[EyeGuard posture] baseline captured", baselineRef.current);
              }

              animationFrameRef.current = window.requestAnimationFrame(loop);
              return;
            }

            const assessment = assessPosture(features, baselineRef.current, postureSensitivity);
            smoothedScoreRef.current = smoothedScoreRef.current * 0.84 + assessment.metrics.score * 0.16;
            const metrics: PostureMetrics = {
              ...assessment.metrics,
              score: Number(smoothedScoreRef.current.toFixed(3))
            };

            const previousState = postureStateRef.current;
            let nextState: MonitoringState["postureState"] = previousState;
            if (previousState !== "warning" && metrics.score > 0.38 && assessment.reasons.length > 0) {
              nextState = "warning";
            } else if (previousState === "warning" && metrics.score < 0.18) {
              nextState = "good";
            } else if (previousState === "unknown") {
              nextState = assessment.reasons.length > 0 && metrics.score > 0.38 ? "warning" : "good";
            }

            updatePostureUi(nextState, assessment.reasons, metrics);

            const leadingReason = assessment.reasons[0] ?? "baseline aligned";
            drawGuide(
              videoRef.current,
              nextState === "warning",
              ear,
              nextState === "warning" ? `Warning: ${leadingReason}` : "Aligned to your baseline",
              `score ${metrics.score.toFixed(2)}`
            );

            if (nextState === "warning") {
              if (Date.now() - lastUiAlertAtRef.current > 15000) {
                lastUiAlertAtRef.current = Date.now();
                setLastAlertAt(new Date().toISOString());
              }
              onPostureAlertRef.current({
                baselineReady: true,
                reasons: assessment.reasons,
                metrics
              });
              if (previousState !== "warning" || Date.now() - lastConsoleWarningAtRef.current > 5000) {
                lastConsoleWarningAtRef.current = Date.now();
                console.info("[EyeGuard posture] warning", {
                  reasons: assessment.reasons,
                  metrics
                });
              }
            }
          } else {
            setPostureState("unknown");
            drawGuide(videoRef.current, false, 0, "No face detected", "Adjust your camera angle");
          }

          animationFrameRef.current = window.requestAnimationFrame(loop);
        };

        animationFrameRef.current = window.requestAnimationFrame(loop);
      } catch (error) {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setCameraState(denied ? "denied" : "error");
        setHelperMessage(
          denied
            ? "Camera permission was denied. EyeGuard will continue with timers and guided breaks only."
            : "Camera permission may be granted, but no usable video frames arrived. Check the physical shutter, privacy key, Windows camera privacy settings, or whether another app is using the camera."
        );
        console.warn("[EyeGuard camera] startup failed", error);
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      faceLandmarker?.close();
      poseLandmarker?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [enabled, pausedForBackground, postureSensitivity, recalibrationNonce]);

  return {
    cameraState,
    postureState,
    blinkCount,
    postureAlertVisible: postureState === "warning",
    postureReasons,
    postureMetrics,
    calibrationState,
    calibrationProgress,
    lastAlertAt,
    videoRef,
    overlayRef,
    helperMessage,
    recalibrate() {
      setCalibrationState("needed");
      setCalibrationProgress(0);
      setHelperMessage("Recalibrating posture baseline. Hold your normal seated posture for about 2 seconds.");
      setRecalibrationNonce((value) => value + 1);
    }
  };
}
