import type { VisionBackgroundSessionSummary } from "@eyeguard/types";

const DEFAULT_VISION_SERVICE_URL = "http://127.0.0.1:8765";

async function resolveVisionServiceUrl(): Promise<string> {
  if (window.electronBridge?.getVisionServiceUrl) {
    return window.electronBridge.getVisionServiceUrl();
  }
  return DEFAULT_VISION_SERVICE_URL;
}

async function request(path: string, init: RequestInit = {}) {
  const baseUrl = await resolveVisionServiceUrl();
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

export const visionServiceClient = {
  async startSession(postureSensitivity: number): Promise<void> {
    const response = await request("/session/start", {
      method: "POST",
      body: JSON.stringify({
        posture_sensitivity: postureSensitivity
      })
    });
    if (!response.ok) {
      throw new Error("Unable to start background vision monitoring.");
    }
  },

  async stopSession(): Promise<VisionBackgroundSessionSummary> {
    const response = await request("/session/stop", {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error("Unable to stop background vision monitoring.");
    }
    const raw = await response.json();
    return {
      active: Boolean(raw.active),
      blinkCount: raw.blink_count ?? 0,
      blinkBuckets: (raw.blink_buckets ?? []).map((bucket: any) => ({
        bucketStart: bucket.bucket_start,
        blinkCount: bucket.blink_count
      })),
      postureEvents: (raw.posture_events ?? []).map((event: any) => ({
        occurredAt: event.occurred_at,
        severity: event.severity,
        message: event.message,
        details: event.details
          ? {
              baselineReady: event.details.baseline_ready,
              reasons: event.details.reasons,
              metrics: {
                rollDegrees: event.details.metrics.roll_degrees,
                rollDeltaDegrees: event.details.metrics.roll_delta_degrees,
                verticalRatio: event.details.metrics.vertical_ratio,
                verticalDelta: event.details.metrics.vertical_delta,
                centerOffsetRatio: event.details.metrics.center_offset_ratio,
                centerDelta: event.details.metrics.center_delta,
                leanRatio: event.details.metrics.lean_ratio,
                leanDelta: event.details.metrics.lean_delta,
                shoulderRollDegrees: event.details.metrics.shoulder_roll_degrees,
                shoulderRollDeltaDegrees: event.details.metrics.shoulder_roll_delta_degrees,
                shoulderNeckRatio: event.details.metrics.shoulder_neck_ratio,
                shoulderNeckDelta: event.details.metrics.shoulder_neck_delta,
                score: event.details.metrics.score
              }
            }
          : undefined
      })),
      note: raw.note ?? "Background vision monitoring stopped."
    };
  }
};
