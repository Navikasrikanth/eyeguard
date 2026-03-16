import type { CoachStatus, PostureCoachReview } from "@eyeguard/types";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { apiClient } from "@/api/client";
import { CameraPanel } from "@/components/monitoring/CameraPanel";
import { CoachConsentModal } from "@/components/monitoring/CoachConsentModal";
import { FatigueCard } from "@/components/monitoring/FatigueCard";
import { useAuth } from "@/features/auth/AuthContext";
import { useMonitoring } from "@/features/monitoring/MonitoringContext";
import { useMonitoringEngine } from "@/features/monitoring/useMonitoringEngine";
import { showWellnessNotification } from "@/utils/notifications";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function captureFrame(video: HTMLVideoElement): string {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error("Camera preview is not ready for capture yet.");
  }
  const maxDimension = 720;
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare a snapshot for AI review.");
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function formatCoachLabel(label: PostureCoachReview["postureLabel"]): string {
  switch (label) {
    case "aligned":
      return "Aligned";
    case "mild_forward_head":
      return "Mild forward head";
    case "slumped_forward":
      return "Slumped forward";
    case "asymmetrical_load":
      return "Asymmetrical load";
    case "temporary_non_desk_pose":
      return "Temporary non-desk pose";
    default:
      return "Unclear";
  }
}

export function HomePage() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const { backgroundVisionActive, beginBreak, nextBreakInSeconds, recordBlink, recordPostureAlert, screenTimeSeconds } =
    useMonitoring();
  const [coachStatus, setCoachStatus] = useState<CoachStatus | null>(null);
  const [coachReview, setCoachReview] = useState<PostureCoachReview | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachConsentOpen, setCoachConsentOpen] = useState(false);
  const monitoring = useMonitoringEngine({
    enabled: Boolean(settings?.cameraEnabled) && !backgroundVisionActive,
    postureSensitivity: settings?.postureSensitivity ?? 0.62,
    onBlink: () => recordBlink(1),
    onPostureAlert: (details) => recordPostureAlert(t("postureAlert"), details),
    pausedForBackground: backgroundVisionActive
  });
  const postureDriftDetected =
    monitoring.calibrationState === "ready" &&
    monitoring.postureState !== "warning" &&
    (monitoring.postureReasons.length > 0 || (monitoring.postureMetrics?.score ?? 0) >= 0.1);

  useEffect(() => {
    let mounted = true;
    async function loadCoachStatus() {
      try {
        const status = await apiClient.getCoachStatus();
        if (mounted) {
          setCoachStatus(status);
        }
      } catch (error) {
        if (mounted) {
          setCoachStatus({
            available: false,
            provider: null,
            model: null,
            note: error instanceof Error ? error.message : "Unable to load AI coach status."
          });
        }
      }
    }
    void loadCoachStatus();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleCoachReview() {
    const video = monitoring.videoRef.current;
    if (!video) {
      setCoachError("Camera preview is not available yet.");
      return;
    }

    try {
      setCoachLoading(true);
      setCoachError(null);
      const imageDataUrl = captureFrame(video);
      const review = await apiClient.reviewPostureWithCoach({
        imageDataUrl,
        localContext: {
          postureState: monitoring.postureState,
          reasons: monitoring.postureReasons,
          metrics: monitoring.postureMetrics
        }
      });
      setCoachReview(review);
      setCoachConsentOpen(false);
      if (settings?.notificationsEnabled) {
        void showWellnessNotification({
          title: "AI coach review ready",
          body: `Result: ${formatCoachLabel(review.postureLabel)}. ${review.coaching}`,
          tag: "eyeguard-ai-coach-review",
          focusOnClick: true
        });
      }
    } catch (error) {
      setCoachError(error instanceof Error ? error.message : "Unable to review posture with AI.");
    } finally {
      setCoachLoading(false);
    }
  }

  function openCoachConsent() {
    setCoachError(null);
    setCoachConsentOpen(true);
  }

  const stats = [
    {
      label: "Blink count",
      value: monitoring.blinkCount,
      detail: "Resets when you restart monitoring."
    },
    {
      label: "Posture status",
      value:
        monitoring.postureState === "warning"
          ? "Warning"
          : postureDriftDetected
            ? "Watch posture"
            : monitoring.postureState === "good"
              ? "Aligned"
              : "Checking",
      detail:
        monitoring.calibrationState !== "ready"
          ? `Calibration ${Math.round(monitoring.calibrationProgress * 100)}%`
          : postureDriftDetected && monitoring.postureReasons.length > 0
            ? `Detected: ${monitoring.postureReasons.join(", ")}`
          : monitoring.lastAlertAt
            ? `Last alert ${new Date(monitoring.lastAlertAt).toLocaleTimeString()}`
            : "No recent alert"
    },
    {
      label: "Session screen time",
      value: formatDuration(screenTimeSeconds),
      detail: "Only accumulates while the app is visible and not on break."
    },
    {
      label: "Next reminder",
      value: formatDuration(nextBreakInSeconds),
      detail: `Interval: ${settings?.reminderIntervalMinutes ?? 20} minutes`
    }
  ];

  const coachMetrics = coachReview
    ? [
        {
          label: "AI posture label",
          value: formatCoachLabel(coachReview.postureLabel),
          detail: coachReview.reasons.join(", ")
        },
        {
          label: "Severity",
          value: coachReview.severity,
          detail: coachReview.shouldTriggerAlert ? "Suggests a posture alert." : "Suggests a softer cue."
        },
        {
          label: "Confidence",
          value: `${Math.round(coachReview.confidence * 100)}%`,
          detail: coachReview.cameraAngleLimited ? "Camera angle limited certainty." : "Angle looked usable."
        },
        {
          label: "Desk pose",
          value: coachReview.deskPose === "neutral_desk_pose" ? "Desk posture" : coachReview.deskPose === "temporary_non_desk_pose" ? "Temporary pose" : "Unclear",
          detail: `Model: ${coachReview.model}`
        }
      ]
    : [];

  return (
    <div className="page-stack">
      <CoachConsentModal
        loading={coachLoading}
        onCancel={() => {
          if (!coachLoading) {
            setCoachConsentOpen(false);
          }
        }}
        onConfirm={() => void handleCoachReview()}
        open={coachConsentOpen}
        provider={coachStatus?.provider ?? null}
      />

      <section className="hero-panel card hero-monitor">
        <div className="hero-copy-block">
          <p className="eyebrow">Real-time wellness guidance</p>
          <h2>Stay upright, blink often, and take smarter micro-breaks.</h2>
          <p>
            EyeGuard watches for blink cadence and approximate posture cues to support healthier desk habits. It is a
            wellness assistant only and does not diagnose medical conditions.
          </p>
          <div className="button-row">
            <button className="primary-button" onClick={() => beginBreak("manual")} type="button">
              {t("manualBreak")}
            </button>
            <button className="ghost-button" onClick={() => monitoring.recalibrate()} type="button">
              Recalibrate posture
            </button>
            <div className="pill warning-pill">{t("wellnessOnly")}</div>
          </div>
        </div>
        <div className="hero-accent" />
      </section>

      <div className="home-grid">
        <CameraPanel
          videoRef={monitoring.videoRef}
          overlayRef={monitoring.overlayRef}
          cameraState={monitoring.cameraState}
          helperMessage={monitoring.helperMessage}
        />

        <section className="card status-card-grid">
          <div className="card-head">
            <div>
              <p className="eyebrow">{t("monitoringStatus")}</p>
              <h3>Current wellness snapshot</h3>
            </div>
          </div>

          <div className="metric-grid">
            {stats.map((stat) => (
              <motion.article
                className="metric-card"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38 }}
                key={stat.label}
              >
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.detail}</small>
              </motion.article>
            ))}
          </div>

          {monitoring.calibrationState !== "ready" ? (
            <div className="support-banner">
              <strong>Calibrating your baseline</strong>
              <span>
                Hold your most upright neutral posture while EyeGuard learns your baseline. This makes slouch, head
                tilt, and uneven-shoulder detection stricter after calibration.
              </span>
            </div>
          ) : monitoring.postureAlertVisible ? (
            <div className="alert-banner">
              <strong>{t("postureAlert")}</strong>
              <span>
                {monitoring.postureReasons.length > 0
                  ? `Detected: ${monitoring.postureReasons.join(", ")}.`
                  : "Relax your shoulders, raise your chest, and level your gaze with the screen."}
              </span>
            </div>
          ) : postureDriftDetected ? (
            <div className="support-banner">
              <strong>Posture drift detected</strong>
              <span>
                {monitoring.postureReasons.length > 0
                  ? `EyeGuard is already seeing ${monitoring.postureReasons.join(", ")}. Straighten up now before it becomes a full warning.`
                  : "Your posture score is climbing away from baseline. Reset your shoulders, neck, and gaze now."}
              </span>
            </div>
          ) : (
            <div className="support-banner">
              <strong>Healthy baseline</strong>
              <span>
                {monitoring.postureMetrics
                  ? `Roll delta ${monitoring.postureMetrics.rollDeltaDegrees.toFixed(1)} deg, vertical delta ${monitoring.postureMetrics.verticalDelta.toFixed(3)}, lean delta ${monitoring.postureMetrics.leanDelta.toFixed(3)}, shoulder-neck delta ${monitoring.postureMetrics.shoulderNeckDelta.toFixed(3)}.`
                  : "Look away during breaks and keep your eyes level with the top third of the display."}
              </span>
            </div>
          )}
        </section>
      </div>

      <FatigueCard
        backgroundVisionActive={backgroundVisionActive}
        blinkCount={monitoring.blinkCount}
        cameraEnabled={Boolean(settings?.cameraEnabled)}
        cameraReady={monitoring.cameraState === "ready"}
        nextBreakInSeconds={nextBreakInSeconds}
        postureMetrics={monitoring.postureMetrics}
        postureState={monitoring.postureState}
        reminderIntervalMinutes={settings?.reminderIntervalMinutes ?? 20}
        screenTimeSeconds={screenTimeSeconds}
      />

      <section className="card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Optional AI coach</p>
            <h3>Ask for a one-off posture second opinion</h3>
          </div>
          <div className={`status-pill ${coachStatus?.available ? "status-ready" : "status-pending"}`}>
            {coachStatus?.available ? "AI ready" : "Local only"}
          </div>
        </div>

        <p className="support-copy">
          EyeGuard keeps real-time monitoring on-device. This optional coach sends one current snapshot only when you
          request it, and the image is not stored in EyeGuard.
        </p>

        {window.electronBridge ? (
          <div className="support-banner">
            {backgroundVisionActive
              ? "Background vision service is monitoring while EyeGuard is not the active window."
              : "In Electron, EyeGuard can hand off webcam monitoring to a local Python service when the app goes to the background."}
          </div>
        ) : null}

        <div className="button-row">
          <button
            className="primary-button"
            disabled={!coachStatus?.available || monitoring.cameraState !== "ready" || coachLoading}
            onClick={openCoachConsent}
            type="button"
          >
            {coachLoading ? "Reviewing..." : "Review posture with AI"}
          </button>
          <div className="pill">
            {coachStatus?.model ? coachStatus.model : "Set OPENAI_API_KEY on the backend to enable this"}
          </div>
        </div>

        {coachError ? <div className="error-banner">{coachError}</div> : null}
        {coachStatus?.note ? <div className="support-banner">{coachStatus.note}</div> : null}

        {coachReview ? (
          <div className="page-stack">
            <div className="metric-grid">
              {coachMetrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.detail}</small>
                </article>
              ))}
            </div>

            <div className={coachReview.shouldTriggerAlert ? "alert-banner" : "support-banner"}>
              <strong>AI coaching</strong>
              <span>{coachReview.coaching}</span>
            </div>

            <div className="event-item">
              <strong>Wellness note</strong>
              <span>{coachReview.wellnessNote}</span>
              <span>Reviewed at {new Date(coachReview.reviewedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
