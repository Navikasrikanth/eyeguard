import type {
  AnalyticsSummary,
  AuthResponse,
  BlinkPayload,
  BreakPayload,
  CoachStatus,
  PostureCoachReview,
  PostureCoachReviewRequest,
  PostureDetails,
  PosturePayload,
  SessionTickPayload,
  UserProfile,
  UserSettings
} from "@eyeguard/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const STORAGE_KEY = "eyeguard.auth";

type RawAuthResponse = {
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  user: {
    id: number;
    email: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    language: "en" | "hi";
    created_at: string;
  };
  settings: {
    language: "en" | "hi";
    reminder_interval_minutes: number;
    notifications_enabled: boolean;
    camera_enabled: boolean;
    posture_sensitivity: number;
    launch_on_startup: boolean;
    force_break_enabled: boolean;
  };
};

type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

function normalizeUser(user: RawAuthResponse["user"]): UserProfile {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    language: user.language,
    createdAt: user.created_at
  };
}

function normalizeSettings(settings: RawAuthResponse["settings"]): UserSettings {
  return {
    language: settings.language,
    reminderIntervalMinutes: settings.reminder_interval_minutes,
    notificationsEnabled: settings.notifications_enabled,
    cameraEnabled: settings.camera_enabled,
    postureSensitivity: settings.posture_sensitivity,
    launchOnStartup: settings.launch_on_startup,
    forceBreakEnabled: settings.force_break_enabled
  };
}

function normalizeAuthResponse(raw: RawAuthResponse): AuthResponse {
  return {
    tokens: {
      accessToken: raw.tokens.access_token,
      refreshToken: raw.tokens.refresh_token,
      expiresIn: raw.tokens.expires_in
    },
    user: normalizeUser(raw.user),
    settings: normalizeSettings(raw.settings)
  };
}

function normalizeAnalytics(raw: any): AnalyticsSummary {
  const normalizeDailyMetric = (point: any) => ({
    date: point.date,
    totalScreenTimeSeconds: point.total_screen_time_seconds,
    totalBreaks: point.total_breaks,
    totalAlerts: point.total_alerts,
    postureAlerts: point.posture_alerts,
    totalBlinks: point.total_blinks
  });

  return {
    today: raw.today ? normalizeDailyMetric(raw.today) : null,
    streakDays: raw.streak_days,
    totals: raw.totals,
    history: raw.history.map(normalizeDailyMetric),
    postureEvents: raw.posture_events.map((event: any) => ({
      id: event.id,
      createdAt: event.created_at,
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
              shoulderRollDegrees: event.details.metrics.shoulder_roll_degrees ?? 0,
              shoulderRollDeltaDegrees: event.details.metrics.shoulder_roll_delta_degrees ?? 0,
              shoulderNeckRatio: event.details.metrics.shoulder_neck_ratio ?? 0,
              shoulderNeckDelta: event.details.metrics.shoulder_neck_delta ?? 0,
              score: event.details.metrics.score
            }
          }
        : undefined
    })),
    breakEvents: raw.break_events.map((event: any) => ({
      id: event.id,
      startedAt: event.started_at,
      endedAt: event.ended_at,
      durationSeconds: event.duration_seconds,
      initiatedBy: event.initiated_by
    })),
    blinkBuckets: raw.blink_buckets.map((bucket: any) => ({
      bucketStart: bucket.bucket_start,
      blinkCount: bucket.blink_count
    }))
  };
}

export function loadStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveStoredSession(session: StoredSession | null): void {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function request(path: string, init: RequestInit = {}, accessToken?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });
}

async function extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload?.detail)) {
      const first = payload.detail[0];
      if (typeof first?.msg === "string") {
        const field = Array.isArray(first?.loc) ? first.loc.at(-1) : null;
        return field ? `${field}: ${first.msg}` : first.msg;
      }
      return payload.detail.map((item: unknown) => String(item)).join(", ");
    }
    if (typeof payload?.message === "string") {
      return payload.message;
    }
  } catch {
    // Fall back to the default message when the body is empty or non-JSON.
  }
  return fallbackMessage;
}

async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const session = loadStoredSession();
  const response = await request(path, init, session?.accessToken);
  if (response.status !== 401 || !session?.refreshToken) {
    return response;
  }

  const refreshed = await apiClient.refresh(session.refreshToken);
  saveStoredSession({
    accessToken: refreshed.tokens.accessToken,
    refreshToken: refreshed.tokens.refreshToken
  });
  return request(path, init, refreshed.tokens.accessToken);
}

export const apiClient = {
  async signup(payload: { email: string; username: string; password: string }): Promise<AuthResponse> {
    const response = await request("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to create account."));
    }
    return normalizeAuthResponse((await response.json()) as RawAuthResponse);
  },

  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    const response = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to sign in."));
    }
    return normalizeAuthResponse((await response.json()) as RawAuthResponse);
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const response = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) {
      throw new Error("Session expired.");
    }
    return normalizeAuthResponse((await response.json()) as RawAuthResponse);
  },

  async logout(refreshToken: string): Promise<void> {
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken })
    });
  },

  async getProfile(): Promise<UserProfile> {
    const response = await authedRequest("/users/me");
    if (!response.ok) {
      throw new Error("Unable to load profile.");
    }
    const raw = await response.json();
    return {
      id: raw.id,
      email: raw.email,
      username: raw.username,
      fullName: raw.full_name,
      avatarUrl: raw.avatar_url,
      bio: raw.bio,
      language: raw.language,
      createdAt: raw.created_at
    };
  },

  async updateProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
    const response = await authedRequest("/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        username: payload.username,
        full_name: payload.fullName,
        avatar_url: payload.avatarUrl,
        bio: payload.bio,
        language: payload.language
      })
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to save profile."));
    }
    const raw = await response.json();
    return {
      id: raw.id,
      email: raw.email,
      username: raw.username,
      fullName: raw.full_name,
      avatarUrl: raw.avatar_url,
      bio: raw.bio,
      language: raw.language,
      createdAt: raw.created_at
    };
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<void> {
    const response = await authedRequest("/users/me/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: payload.currentPassword,
        new_password: payload.newPassword
      })
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to change password."));
    }
  },

  async getSettings(): Promise<UserSettings> {
    const response = await authedRequest("/settings/me");
    if (!response.ok) {
      throw new Error("Unable to load settings.");
    }
    return normalizeSettings((await response.json()) as RawAuthResponse["settings"]);
  },

  async updateSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
    const response = await authedRequest("/settings/me", {
      method: "PATCH",
      body: JSON.stringify({
        language: payload.language,
        reminder_interval_minutes: payload.reminderIntervalMinutes,
        notifications_enabled: payload.notificationsEnabled,
        camera_enabled: payload.cameraEnabled,
        posture_sensitivity: payload.postureSensitivity,
        launch_on_startup: payload.launchOnStartup,
        force_break_enabled: payload.forceBreakEnabled
      })
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to save settings."));
    }
    return normalizeSettings((await response.json()) as RawAuthResponse["settings"]);
  },

  async getAnalytics(days = 14): Promise<AnalyticsSummary> {
    const response = await authedRequest(`/analytics/summary?days=${days}`);
    if (!response.ok) {
      throw new Error("Unable to load analytics.");
    }
    return normalizeAnalytics(await response.json());
  },

  async getCoachStatus(): Promise<CoachStatus> {
    const response = await authedRequest("/coach/status");
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to load AI coach status."));
    }
    const raw = await response.json();
    return {
      available: Boolean(raw.available),
      provider: raw.provider === "gemini" || raw.provider === "openai" ? raw.provider : null,
      model: raw.model ?? null,
      note: raw.note
    };
  },

  async reviewPostureWithCoach(payload: PostureCoachReviewRequest): Promise<PostureCoachReview> {
    const response = await authedRequest("/coach/posture-review", {
      method: "POST",
      body: JSON.stringify({
        image_data_url: payload.imageDataUrl,
        local_context: payload.localContext
          ? {
              posture_state: payload.localContext.postureState,
              reasons: payload.localContext.reasons,
              metrics: payload.localContext.metrics
                ? {
                    roll_degrees: payload.localContext.metrics.rollDegrees,
                    roll_delta_degrees: payload.localContext.metrics.rollDeltaDegrees,
                    vertical_ratio: payload.localContext.metrics.verticalRatio,
                    vertical_delta: payload.localContext.metrics.verticalDelta,
                    center_offset_ratio: payload.localContext.metrics.centerOffsetRatio,
                    center_delta: payload.localContext.metrics.centerDelta,
                    lean_ratio: payload.localContext.metrics.leanRatio,
                    lean_delta: payload.localContext.metrics.leanDelta,
                    shoulder_roll_degrees: payload.localContext.metrics.shoulderRollDegrees,
                    shoulder_roll_delta_degrees: payload.localContext.metrics.shoulderRollDeltaDegrees,
                    shoulder_neck_ratio: payload.localContext.metrics.shoulderNeckRatio,
                    shoulder_neck_delta: payload.localContext.metrics.shoulderNeckDelta,
                    score: payload.localContext.metrics.score
                  }
                : undefined
            }
          : undefined
      })
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Unable to review posture with AI."));
    }
    const raw = await response.json();
    return {
      reviewedAt: raw.reviewed_at,
      model: raw.model,
      postureLabel: raw.posture_label,
      severity: raw.severity,
      confidence: raw.confidence,
      shouldTriggerAlert: raw.should_trigger_alert,
      deskPose: raw.desk_pose,
      cameraAngleLimited: raw.camera_angle_limited,
      reasons: raw.reasons,
      coaching: raw.coaching,
      wellnessNote: raw.wellness_note
    };
  },

  async sendSessionTick(payload: SessionTickPayload): Promise<void> {
    await authedRequest("/metrics/session-tick", {
      method: "POST",
      body: JSON.stringify({
        elapsed_seconds: payload.elapsedSeconds,
        source: payload.source
      })
    });
  },

  async sendBlink(payload: BlinkPayload): Promise<void> {
    await authedRequest("/metrics/blink", {
      method: "POST",
      body: JSON.stringify({
        count: payload.count,
        bucket_start: payload.bucketStart
      })
    });
  },

  async sendPosture(payload: PosturePayload): Promise<void> {
    await authedRequest("/metrics/posture", {
      method: "POST",
      body: JSON.stringify({
        severity: payload.severity,
        message: payload.message,
        occurred_at: payload.occurredAt,
        details: payload.details
          ? {
              baseline_ready: payload.details.baselineReady,
              reasons: payload.details.reasons,
              metrics: {
                roll_degrees: payload.details.metrics.rollDegrees,
                roll_delta_degrees: payload.details.metrics.rollDeltaDegrees,
                vertical_ratio: payload.details.metrics.verticalRatio,
                vertical_delta: payload.details.metrics.verticalDelta,
                center_offset_ratio: payload.details.metrics.centerOffsetRatio,
                center_delta: payload.details.metrics.centerDelta,
                lean_ratio: payload.details.metrics.leanRatio,
                lean_delta: payload.details.metrics.leanDelta,
                shoulder_roll_degrees: payload.details.metrics.shoulderRollDegrees,
                shoulder_roll_delta_degrees: payload.details.metrics.shoulderRollDeltaDegrees,
                shoulder_neck_ratio: payload.details.metrics.shoulderNeckRatio,
                shoulder_neck_delta: payload.details.metrics.shoulderNeckDelta,
                score: payload.details.metrics.score
              }
            }
          : undefined
      })
    });
  },

  async sendReminder(occurredAt: string): Promise<void> {
    await authedRequest("/metrics/reminder", {
      method: "POST",
      body: JSON.stringify({
        occurred_at: occurredAt,
        kind: "20-20-20"
      })
    });
  },

  async sendBreak(payload: BreakPayload): Promise<void> {
    await authedRequest("/metrics/break", {
      method: "POST",
      body: JSON.stringify({
        started_at: payload.startedAt,
        ended_at: payload.endedAt,
        duration_seconds: payload.durationSeconds,
        initiated_by: payload.initiatedBy
      })
    });
  }
};
