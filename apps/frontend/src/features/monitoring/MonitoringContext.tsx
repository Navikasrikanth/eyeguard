import type { PostureDetails } from "@eyeguard/types";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiClient } from "@/api/client";
import { useAuth } from "@/features/auth/AuthContext";
import { visionServiceClient } from "@/features/monitoring/visionServiceClient";
import { showWellnessNotification } from "@/utils/notifications";

type BreakSource = "auto" | "manual";

type ActiveBreak = {
  startedAt: string;
  source: BreakSource;
} | null;

type MonitoringContextValue = {
  screenTimeSeconds: number;
  nextBreakInSeconds: number;
  reminderOpen: boolean;
  activeBreak: ActiveBreak;
  backgroundVisionActive: boolean;
  beginBreak: (source: BreakSource) => void;
  dismissReminder: (snoozeSeconds?: number) => void;
  completeBreak: () => Promise<void>;
  recordBlink: (count?: number) => void;
  recordPostureAlert: (message?: string, details?: PostureDetails) => void;
  forceBreakEnabled: boolean;
};

const MonitoringContext = createContext<MonitoringContextValue | null>(null);

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useAuth();
  const isDesktopShell = Boolean(window.electronBridge);
  const intervalMinutes = settings?.reminderIntervalMinutes ?? 20;
  const forceBreakEnabled = Boolean(settings?.forceBreakEnabled);
  const notificationsEnabled = Boolean(settings?.notificationsEnabled);
  const [screenTimeSeconds, setScreenTimeSeconds] = useState(0);
  const [nextBreakInSeconds, setNextBreakInSeconds] = useState(intervalMinutes * 60);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak>(null);
  const [backgroundVisionActive, setBackgroundVisionActive] = useState(false);
  const nextBreakInSecondsRef = useRef(intervalMinutes * 60);
  const screenTimeSecondsRef = useRef(0);
  const pendingScreenSecondsRef = useRef(0);
  const lastPosturePersistedAtRef = useRef(0);
  const lastBlinkAtRef = useRef<number | null>(null);
  const lastBlinkNotificationAtRef = useRef(0);
  const lastAnalyticsNotificationMinuteRef = useRef(0);
  const lastPreBreakNotificationMinuteRef = useRef(0);
  const postureWarningSinceRef = useRef<number | null>(null);
  const postureNotificationSentRef = useRef(false);
  const postureWarningResetTimeoutRef = useRef<number | null>(null);
  const reminderOpenRef = useRef(false);
  const backgroundVisionActiveRef = useRef(false);
  const backgroundStartTimeoutRef = useRef<number | null>(null);
  const forceBreakEnabledRef = useRef(forceBreakEnabled);
  const notificationsEnabledRef = useRef(notificationsEnabled);

  useEffect(() => {
    reminderOpenRef.current = reminderOpen;
  }, [reminderOpen]);

  useEffect(() => {
    backgroundVisionActiveRef.current = backgroundVisionActive;
  }, [backgroundVisionActive]);

  useEffect(() => {
    forceBreakEnabledRef.current = forceBreakEnabled;
  }, [forceBreakEnabled]);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    if (activeBreak) {
      return;
    }
    const nextValue =
      nextBreakInSecondsRef.current > intervalMinutes * 60
        ? intervalMinutes * 60
        : nextBreakInSecondsRef.current || intervalMinutes * 60;
    nextBreakInSecondsRef.current = nextValue;
    setNextBreakInSeconds(nextValue);
  }, [activeBreak, intervalMinutes]);

  async function presentForceBreakWindow() {
    if (window.electronBridge?.presentForceBreak) {
      try {
        await window.electronBridge.presentForceBreak();
        return;
      } catch (error) {
        console.warn("[EyeGuard force break] failed to present Electron window", error);
      }
    }

    window.focus();
  }

  async function releaseForceBreakWindow() {
    if (!window.electronBridge?.releaseForceBreak) {
      return;
    }

    try {
      await window.electronBridge.releaseForceBreak();
    } catch (error) {
      console.warn("[EyeGuard force break] failed to release Electron window", error);
    }
  }

  useEffect(() => {
    return () => {
      if (postureWarningResetTimeoutRef.current !== null) {
        window.clearTimeout(postureWarningResetTimeoutRef.current);
      }
      void releaseForceBreakWindow();
    };
  }, []);

  function startBreakSession(source: BreakSource, forced = false) {
    const startedAt = new Date().toISOString();
    setReminderOpen(false);
    reminderOpenRef.current = false;
    setActiveBreak({ startedAt, source });
    if (forced) {
      void presentForceBreakWindow();
    }
    window.requestAnimationFrame(() => navigate("/break"));
  }

  async function showReminderNotification(forced: boolean) {
    if (!notificationsEnabledRef.current) {
      return;
    }
    await showWellnessNotification({
      title: forced ? "Break required now" : "EyeGuard break reminder",
      body: forced
        ? "Force break is enabled. EyeGuard is starting your 20-second recovery break now."
        : "Time for a 20-second reset. Look away from the screen and relax your shoulders.",
      tag: forced ? "eyeguard-force-break" : "eyeguard-break-reminder",
      focusOnClick: true
    });
  }

  async function showUpcomingBreakNotification() {
    if (!notificationsEnabledRef.current) {
      return;
    }
    await showWellnessNotification({
      title: "Break starts in 30 seconds",
      body: "Wrap up your current task. EyeGuard will prompt a 20-second recovery break shortly.",
      tag: "eyeguard-break-warning",
      focusOnClick: true
    });
  }

  async function showPostureStreakNotification() {
    if (!notificationsEnabledRef.current) {
      return;
    }
    await showWellnessNotification({
      title: "Posture check",
      body: "You've had poor posture for 2 minutes. Relax your shoulders and bring your head back over your torso.",
      tag: "eyeguard-posture-streak",
      focusOnClick: true
    });
  }

  async function showBlinkReminderNotification() {
    if (!notificationsEnabledRef.current) {
      return;
    }
    await showWellnessNotification({
      title: "Blink reminder",
      body: "Your blink rate has been low. Blink slowly a few times and soften your gaze.",
      tag: "eyeguard-blink-reminder",
      focusOnClick: true
    });
  }

  async function showAnalyticsNotification(totalSeconds: number) {
    if (!notificationsEnabledRef.current) {
      return;
    }
    const totalMinutes = Math.round(totalSeconds / 60);
    await showWellnessNotification({
      title: "Wellness summary ready",
      body: `You've logged ${totalMinutes} minutes this session. Open Dashboard to review your trends.`,
      tag: "eyeguard-analytics-summary",
      focusOnClick: true
    });
  }

  useEffect(() => {
    const tickId = window.setInterval(() => {
      const isBreakScreen = location.pathname === "/break";
      const isVisible = document.visibilityState === "visible";
      const shouldTrackWhileHidden = isDesktopShell;
      if ((!isVisible && !shouldTrackWhileHidden) || isBreakScreen || activeBreak) {
        return;
      }

      let shouldOpenReminder = false;
      let shouldForceBreak = false;

      screenTimeSecondsRef.current += 1;
      setScreenTimeSeconds(screenTimeSecondsRef.current);
      pendingScreenSecondsRef.current += 1;
      if (nextBreakInSecondsRef.current <= 1) {
        if (!reminderOpenRef.current) {
          if (forceBreakEnabledRef.current) {
            shouldForceBreak = true;
          } else {
            shouldOpenReminder = true;
          }
        }
        nextBreakInSecondsRef.current = intervalMinutes * 60;
      } else {
        nextBreakInSecondsRef.current -= 1;
      }
      setNextBreakInSeconds(nextBreakInSecondsRef.current);

      if (nextBreakInSecondsRef.current === 30 && lastPreBreakNotificationMinuteRef.current !== screenTimeSecondsRef.current) {
        lastPreBreakNotificationMinuteRef.current = screenTimeSecondsRef.current;
        if (!isVisible) {
          void showUpcomingBreakNotification();
        }
      }

      if (shouldOpenReminder || shouldForceBreak) {
        void apiClient.sendReminder(new Date().toISOString());
        if (!isVisible || shouldForceBreak) {
          void showReminderNotification(shouldForceBreak);
        }
      }

      if (shouldOpenReminder) {
        reminderOpenRef.current = true;
        setReminderOpen(true);
      }

      if (shouldForceBreak) {
        console.info("[EyeGuard force break] timer expired, starting enforced break");
        startBreakSession("auto", true);
      }

      if (pendingScreenSecondsRef.current >= 10) {
        const elapsedSeconds = pendingScreenSecondsRef.current;
        pendingScreenSecondsRef.current = 0;
        void apiClient.sendSessionTick({
          elapsedSeconds,
          source: isVisible ? "foreground" : "background"
        });
      }

      if (
        settings?.cameraEnabled &&
        lastBlinkAtRef.current &&
        Date.now() - lastBlinkAtRef.current >= 45_000 &&
        Date.now() - lastBlinkNotificationAtRef.current >= 120_000
      ) {
        lastBlinkNotificationAtRef.current = Date.now();
        void showBlinkReminderNotification();
      }

      if (screenTimeSecondsRef.current > 0 && screenTimeSecondsRef.current % 3600 === 0) {
        const sessionMinutes = Math.floor(screenTimeSecondsRef.current / 60);
        if (lastAnalyticsNotificationMinuteRef.current !== sessionMinutes) {
          lastAnalyticsNotificationMinuteRef.current = sessionMinutes;
          void showAnalyticsNotification(screenTimeSecondsRef.current);
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(tickId);
    };
  }, [activeBreak, intervalMinutes, isDesktopShell, location.pathname, navigate, settings?.cameraEnabled]);

  useEffect(() => {
    if (!isDesktopShell || !settings?.cameraEnabled) {
      return;
    }
    const postureSensitivity = settings.postureSensitivity ?? 0.62;

    async function startBackgroundVision() {
      if (backgroundVisionActiveRef.current || activeBreak || location.pathname === "/break") {
        return;
      }
      try {
        await visionServiceClient.startSession(postureSensitivity);
        backgroundVisionActiveRef.current = true;
        setBackgroundVisionActive(true);
      } catch (error) {
        console.warn("[EyeGuard background vision] failed to start", error);
      }
    }

    async function stopBackgroundVisionAndSync() {
      if (!backgroundVisionActiveRef.current) {
        return;
      }
      try {
        const summary = await visionServiceClient.stopSession();
        backgroundVisionActiveRef.current = false;
        setBackgroundVisionActive(false);
        for (const bucket of summary.blinkBuckets) {
          void apiClient.sendBlink({
            count: bucket.blinkCount,
            bucketStart: bucket.bucketStart
          });
        }
        for (const event of summary.postureEvents) {
          void apiClient.sendPosture({
            severity: event.severity,
            message: event.message,
            occurredAt: event.occurredAt,
            details: event.details
          });
        }
      } catch (error) {
        backgroundVisionActiveRef.current = false;
        setBackgroundVisionActive(false);
        console.warn("[EyeGuard background vision] failed to stop/sync", error);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        if (backgroundStartTimeoutRef.current !== null) {
          window.clearTimeout(backgroundStartTimeoutRef.current);
        }
        backgroundStartTimeoutRef.current = window.setTimeout(() => {
          void startBackgroundVision();
        }, 900);
        return;
      }

      if (backgroundStartTimeoutRef.current !== null) {
        window.clearTimeout(backgroundStartTimeoutRef.current);
        backgroundStartTimeoutRef.current = null;
      }
      void stopBackgroundVisionAndSync();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    handleVisibilityChange();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (backgroundStartTimeoutRef.current !== null) {
        window.clearTimeout(backgroundStartTimeoutRef.current);
        backgroundStartTimeoutRef.current = null;
      }
      void stopBackgroundVisionAndSync();
    };
  }, [activeBreak, isDesktopShell, location.pathname, settings?.cameraEnabled, settings?.postureSensitivity]);

  const value = useMemo<MonitoringContextValue>(
    () => ({
      screenTimeSeconds,
      nextBreakInSeconds,
      reminderOpen,
      activeBreak,
      backgroundVisionActive,
      forceBreakEnabled,
      beginBreak(source) {
        startBreakSession(source);
      },
      dismissReminder(snoozeSeconds = 120) {
        if (forceBreakEnabled) {
          startBreakSession("auto", true);
          return;
        }
        reminderOpenRef.current = false;
        setReminderOpen(false);
        nextBreakInSecondsRef.current = snoozeSeconds;
        setNextBreakInSeconds(snoozeSeconds);
      },
      async completeBreak() {
        if (!activeBreak) {
          navigate("/");
          return;
        }
        const endedAt = new Date().toISOString();
        const durationSeconds = Math.max(
          20,
          Math.round((new Date(endedAt).getTime() - new Date(activeBreak.startedAt).getTime()) / 1000)
        );
        await apiClient.sendBreak({
          startedAt: activeBreak.startedAt,
          endedAt,
          durationSeconds,
          initiatedBy: activeBreak.source
        });
        if (activeBreak.source === "auto" && forceBreakEnabled) {
          await releaseForceBreakWindow();
        }
        setActiveBreak(null);
        nextBreakInSecondsRef.current = intervalMinutes * 60;
        setNextBreakInSeconds(intervalMinutes * 60);
        navigate("/");
      },
      recordBlink(count = 1) {
        lastBlinkAtRef.current = Date.now();
        void apiClient.sendBlink({
          count,
          bucketStart: new Date(new Date().setSeconds(0, 0)).toISOString()
        });
      },
      recordPostureAlert(message = "correct your posture", details) {
        const now = Date.now();
        if (!postureWarningSinceRef.current) {
          postureWarningSinceRef.current = now;
          postureNotificationSentRef.current = false;
        }
        if (postureWarningResetTimeoutRef.current !== null) {
          window.clearTimeout(postureWarningResetTimeoutRef.current);
        }
        postureWarningResetTimeoutRef.current = window.setTimeout(() => {
          postureWarningSinceRef.current = null;
          postureNotificationSentRef.current = false;
        }, 3000);

        if (
          postureWarningSinceRef.current &&
          !postureNotificationSentRef.current &&
          now - postureWarningSinceRef.current >= 120_000
        ) {
          postureNotificationSentRef.current = true;
          void showPostureStreakNotification();
        }

        if (now - lastPosturePersistedAtRef.current < 20000) {
          return;
        }
        lastPosturePersistedAtRef.current = now;
        void apiClient.sendPosture({
          severity: "high",
          message,
          occurredAt: new Date().toISOString(),
          details
        });
      }
    }),
    [
      activeBreak,
      backgroundVisionActive,
      forceBreakEnabled,
      intervalMinutes,
      navigate,
      nextBreakInSeconds,
      reminderOpen,
      screenTimeSeconds
    ]
  );

  return <MonitoringContext.Provider value={value}>{children}</MonitoringContext.Provider>;
}

export function useMonitoring() {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error("useMonitoring must be used inside MonitoringProvider");
  }
  return context;
}
