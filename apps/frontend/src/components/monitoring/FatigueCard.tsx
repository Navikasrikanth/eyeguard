import type { PostureMetrics } from "@eyeguard/types";
import { useEffect, useRef, useState } from "react";

import {
  FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD,
  FATIGUE_BLUE_LIGHT_RELEASE_THRESHOLD,
  calculateFatigueAssessment
} from "@/features/monitoring/fatigue";

type FatigueCardProps = {
  blinkCount: number;
  cameraReady: boolean;
  cameraEnabled: boolean;
  backgroundVisionActive: boolean;
  postureState: "good" | "warning" | "unknown";
  postureMetrics: PostureMetrics | null;
  screenTimeSeconds: number;
  nextBreakInSeconds: number;
  reminderIntervalMinutes: number;
};

type SystemDisplayState = {
  supported: boolean | null;
  active: boolean;
  message: string;
};

function formatMinutes(totalSeconds: number): string {
  return `${Math.max(1, Math.round(totalSeconds / 60))} min`;
}

export function FatigueCard({
  blinkCount,
  cameraReady,
  cameraEnabled,
  backgroundVisionActive,
  postureState,
  postureMetrics,
  screenTimeSeconds,
  nextBreakInSeconds,
  reminderIntervalMinutes
}: FatigueCardProps) {
  const [trackingSeconds, setTrackingSeconds] = useState(0);
  const [systemFilterArmed, setSystemFilterArmed] = useState(false);
  const [systemDisplayState, setSystemDisplayState] = useState<SystemDisplayState>(() => ({
    supported: null,
    active: false,
    message: window.electronBridge?.setSystemBlueLightFilter
      ? "Watching the fatigue threshold for a full-display blue-light response."
      : "Open EyeGuard in the Windows desktop app to warm the whole laptop display."
  }));
  const lastSyncRef = useRef<{ enabled: boolean; intensity: number | null } | null>(null);
  const activeFilterRef = useRef(false);
  const focusStretchSeconds = Math.max(reminderIntervalMinutes * 60 - nextBreakInSeconds, 0);
  const assessment = calculateFatigueAssessment({
    blinkCount,
    trackingSeconds,
    postureState,
    postureScore: postureMetrics?.score ?? null,
    sessionScreenTimeSeconds: screenTimeSeconds,
    focusStretchSeconds,
    cameraReady: cameraReady && cameraEnabled && !backgroundVisionActive
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!cameraEnabled || backgroundVisionActive || document.visibilityState !== "visible") {
        return;
      }

      setTrackingSeconds((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [backgroundVisionActive, cameraEnabled]);

  useEffect(() => {
    if (assessment.score >= FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD) {
      setSystemFilterArmed(true);
      return;
    }

    if (assessment.score <= FATIGUE_BLUE_LIGHT_RELEASE_THRESHOLD) {
      setSystemFilterArmed(false);
    }
  }, [assessment.score]);

  useEffect(() => {
    const bridge = window.electronBridge;

    if (!bridge?.setSystemBlueLightFilter) {
      return;
    }
    const desktopBridge = bridge;

    const targetEnabled = systemFilterArmed;
    const targetIntensity = targetEnabled ? assessment.displayWarmth : 0;
    const previousSync = lastSyncRef.current;
    const intensityChanged =
      targetEnabled &&
      previousSync?.enabled &&
      previousSync.intensity !== null &&
      Math.abs(previousSync.intensity - targetIntensity) >= 0.08;

    if (previousSync && previousSync.enabled === targetEnabled && !intensityChanged) {
      return;
    }

    let cancelled = false;

    async function syncSystemFilter() {
      try {
        const result = await desktopBridge.setSystemBlueLightFilter({
          enabled: targetEnabled,
          intensity: targetIntensity
        });

        if (cancelled) {
          return;
        }

        activeFilterRef.current = result.active;
        lastSyncRef.current = {
          enabled: targetEnabled,
          intensity: targetEnabled ? targetIntensity : null
        };
        setSystemDisplayState({
          supported: result.supported,
          active: result.active,
          message: result.message
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        activeFilterRef.current = false;
        setSystemDisplayState({
          supported: false,
          active: false,
          message: error instanceof Error ? error.message : "Unable to update the system blue-light filter."
        });
      }
    }

    void syncSystemFilter();

    return () => {
      cancelled = true;
    };
  }, [assessment.displayWarmth, systemFilterArmed]);

  useEffect(() => {
    return () => {
      if (activeFilterRef.current && window.electronBridge?.setSystemBlueLightFilter) {
        void window.electronBridge.setSystemBlueLightFilter({
          enabled: false,
          intensity: 0
        });
      }
    };
  }, []);

  const displayStatusLabel = systemDisplayState.active
    ? "Laptop filter active"
    : systemDisplayState.supported === false
      ? "System filter unavailable"
      : "System filter on standby";
  const statusBannerClass = systemDisplayState.active
    ? "support-banner"
    : systemDisplayState.supported === false
      ? "error-banner"
      : "support-banner";

  const postureLabel =
    postureState === "warning" ? "Warning" : postureState === "good" ? "Aligned" : "Calibrating";

  return (
    <section className="card fatigue-card">
      <div className="card-head">
        <div>
          <p className="eyebrow">Adaptive fatigue score</p>
          <h3>System-wide blue-light response</h3>
        </div>
        <div className={`fatigue-badge fatigue-${assessment.level.toLowerCase()}`}>{assessment.level}</div>
      </div>

      <div className="fatigue-layout">
        <article className="fatigue-score-panel">
          <span>Fatigue score</span>
          <strong>{assessment.score.toFixed(1)}</strong>
          <small>{assessment.summary}</small>
        </article>

        <div className="metric-grid fatigue-metric-grid">
          <article className="metric-card">
            <span>Blink rate</span>
            <strong>{assessment.blinkRatePerMinute === null ? "Collecting" : `${assessment.blinkRatePerMinute}/min`}</strong>
            <small>{cameraEnabled ? `${assessment.blinkLoad} fatigue points from blink cadence` : "Enable the camera to include blink load"}</small>
          </article>

          <article className="metric-card">
            <span>Posture load</span>
            <strong>{postureLabel}</strong>
            <small>{assessment.postureLoad} fatigue points from posture strain</small>
          </article>

          <article className="metric-card">
            <span>Focus stretch</span>
            <strong>{formatMinutes(focusStretchSeconds)}</strong>
            <small>{assessment.screenLoad + assessment.sessionLoad} fatigue points from screen-time pressure</small>
          </article>

          <article className="metric-card">
            <span>Laptop display</span>
            <strong>{displayStatusLabel}</strong>
            <small>{systemDisplayState.message}</small>
          </article>
        </div>
      </div>

      <div className={statusBannerClass}>
        <strong>
          {systemDisplayState.active
            ? "Warm screen mode is active across the desktop."
            : `Blue-light reduction arms at ${FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD} and releases below ${FATIGUE_BLUE_LIGHT_RELEASE_THRESHOLD}.`}
        </strong>
        <span>
          EyeGuard uses live blink, posture, and timer signals to drive a system-wide display response instead of only
          tinting this app window.
        </span>
      </div>

      <div className="fatigue-reason-row">
        {assessment.reasons.map((reason) => (
          <span className="pill fatigue-reason-pill" key={reason}>
            {reason}
          </span>
        ))}
      </div>
    </section>
  );
}
