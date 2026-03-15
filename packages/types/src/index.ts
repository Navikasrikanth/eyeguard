export type Language = "en" | "hi";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: number;
  email: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  language: Language;
  createdAt: string;
}

export interface UserSettings {
  language: Language;
  reminderIntervalMinutes: number;
  notificationsEnabled: boolean;
  cameraEnabled: boolean;
  postureSensitivity: number;
  launchOnStartup: boolean;
}

export interface AuthResponse {
  tokens: AuthTokens;
  user: UserProfile;
  settings: UserSettings;
}

export interface DailyMetricPoint {
  date: string;
  totalScreenTimeSeconds: number;
  totalBreaks: number;
  totalAlerts: number;
  postureAlerts: number;
  totalBlinks: number;
}

export interface BreakEvent {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  initiatedBy: "auto" | "manual";
}

export interface PostureEvent {
  id: number;
  createdAt: string;
  severity: "low" | "medium" | "high";
  message: string;
  details?: PostureDetails;
}

export interface BlinkBucket {
  bucketStart: string;
  blinkCount: number;
}

export interface AnalyticsSummary {
  today: DailyMetricPoint | null;
  streakDays: number;
  totals: {
    screenTimeSeconds: number;
    breaks: number;
    alerts: number;
    postureAlerts: number;
    blinks: number;
  };
  history: DailyMetricPoint[];
  postureEvents: PostureEvent[];
  breakEvents: BreakEvent[];
  blinkBuckets: BlinkBucket[];
}

export interface MonitoringSnapshot {
  cameraState: "pending" | "ready" | "denied" | "unsupported" | "error";
  postureState: "good" | "warning" | "unknown";
  blinkCount: number;
  postureAlertVisible: boolean;
  lastAlertAt: string | null;
  screenTimeSeconds: number;
  nextBreakInSeconds: number;
}

export interface SessionTickPayload {
  elapsedSeconds: number;
  source: "foreground" | "background";
}

export interface BlinkPayload {
  count: number;
  bucketStart: string;
}

export interface BreakPayload {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  initiatedBy: "auto" | "manual";
}

export interface PosturePayload {
  severity: "low" | "medium" | "high";
  message: string;
  occurredAt: string;
  details?: PostureDetails;
}

export interface PostureMetrics {
  rollDegrees: number;
  rollDeltaDegrees: number;
  verticalRatio: number;
  verticalDelta: number;
  centerOffsetRatio: number;
  centerDelta: number;
  leanRatio: number;
  leanDelta: number;
  shoulderRollDegrees: number;
  shoulderRollDeltaDegrees: number;
  shoulderNeckRatio: number;
  shoulderNeckDelta: number;
  score: number;
}

export interface PostureDetails {
  baselineReady: boolean;
  reasons: string[];
  metrics: PostureMetrics;
}

export interface CoachStatus {
  available: boolean;
  model: string | null;
  note: string;
}

export interface PostureCoachLocalContext {
  postureState: "good" | "warning" | "unknown";
  reasons: string[];
  metrics?: PostureMetrics | null;
}

export interface PostureCoachReviewRequest {
  imageDataUrl: string;
  localContext?: PostureCoachLocalContext;
}

export interface PostureCoachReview {
  reviewedAt: string;
  model: string;
  postureLabel:
    | "aligned"
    | "mild_forward_head"
    | "slumped_forward"
    | "asymmetrical_load"
    | "temporary_non_desk_pose"
    | "unclear";
  severity: "good" | "mild" | "moderate";
  confidence: number;
  shouldTriggerAlert: boolean;
  deskPose: "neutral_desk_pose" | "temporary_non_desk_pose" | "unclear";
  cameraAngleLimited: boolean;
  reasons: string[];
  coaching: string;
  wellnessNote: string;
}

export interface VisionBackgroundBlinkBucket {
  bucketStart: string;
  blinkCount: number;
}

export interface VisionBackgroundPostureEvent {
  occurredAt: string;
  severity: "low" | "medium" | "high";
  message: string;
  details?: PostureDetails;
}

export interface VisionBackgroundSessionSummary {
  active: boolean;
  blinkCount: number;
  blinkBuckets: VisionBackgroundBlinkBucket[];
  postureEvents: VisionBackgroundPostureEvent[];
  note: string;
}
