import type { PostureDetails } from "@eyeguard/types";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiClient } from "@/api/client";
import { useAuth } from "@/features/auth/AuthContext";
import { visionServiceClient } from "@/features/monitoring/visionServiceClient";

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
};

const MonitoringContext = createContext<MonitoringContextValue | null>(null);

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useAuth();
  const isDesktopShell = Boolean(window.electronBridge);
  const intervalMinutes = settings?.reminderIntervalMinutes ?? 20;
  const [screenTimeSeconds, setScreenTimeSeconds] = useState(0);
  const [nextBreakInSeconds, setNextBreakInSeconds] = useState(intervalMinutes * 60);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak>(null);
  const [backgroundVisionActive, setBackgroundVisionActive] = useState(false);
  const pendingScreenSecondsRef = useRef(0);
  const lastPosturePersistedAtRef = useRef(0);
  const reminderOpenRef = useRef(false);
  const backgroundVisionActiveRef = useRef(false);
  const backgroundStartTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    reminderOpenRef.current = reminderOpen;
  }, [reminderOpen]);

  useEffect(() => {
    backgroundVisionActiveRef.current = backgroundVisionActive;
  }, [backgroundVisionActive]);

  useEffect(() => {
    setNextBreakInSeconds((current) => {
      if (activeBreak) {
        return current;
      }
      return current > intervalMinutes * 60 ? intervalMinutes * 60 : current || intervalMinutes * 60;
    });
  }, [activeBreak, intervalMinutes]);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      const isBreakScreen = location.pathname === "/break";
      const isVisible = document.visibilityState === "visible";
      const shouldTrackWhileHidden = isDesktopShell;
      if ((!isVisible && !shouldTrackWhileHidden) || isBreakScreen || activeBreak) {
        return;
      }

      setScreenTimeSeconds((value) => value + 1);
      pendingScreenSecondsRef.current += 1;

      setNextBreakInSeconds((current) => {
        if (current <= 1) {
          if (!reminderOpenRef.current) {
            reminderOpenRef.current = true;
            setReminderOpen(true);
            void apiClient.sendReminder(new Date().toISOString());
          }
          return intervalMinutes * 60;
        }
        return current - 1;
      });

      if (pendingScreenSecondsRef.current >= 10) {
        const elapsedSeconds = pendingScreenSecondsRef.current;
        pendingScreenSecondsRef.current = 0;
        void apiClient.sendSessionTick({
          elapsedSeconds,
          source: isVisible ? "foreground" : "background"
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(tickId);
    };
  }, [activeBreak, intervalMinutes, isDesktopShell, location.pathname]);

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
      beginBreak(source) {
        const startedAt = new Date().toISOString();
        setReminderOpen(false);
        reminderOpenRef.current = false;
        setActiveBreak({ startedAt, source });
        window.requestAnimationFrame(() => navigate("/break"));
      },
      dismissReminder(snoozeSeconds = 120) {
        reminderOpenRef.current = false;
        setReminderOpen(false);
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
        setActiveBreak(null);
        setNextBreakInSeconds(intervalMinutes * 60);
        navigate("/");
      },
      recordBlink(count = 1) {
        void apiClient.sendBlink({
          count,
          bucketStart: new Date(new Date().setSeconds(0, 0)).toISOString()
        });
      },
      recordPostureAlert(message = "correct your posture", details) {
        const now = Date.now();
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
    [activeBreak, backgroundVisionActive, intervalMinutes, navigate, nextBreakInSeconds, reminderOpen, screenTimeSeconds]
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
