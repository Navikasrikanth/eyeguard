export type FatigueLevel = "LOW" | "MEDIUM" | "HIGH";

export type FatigueAssessmentInput = {
  blinkCount: number;
  trackingSeconds: number;
  postureState: "good" | "warning" | "unknown";
  postureScore: number | null;
  sessionScreenTimeSeconds: number;
  focusStretchSeconds: number;
  cameraReady: boolean;
};

export type FatigueAssessment = {
  score: number;
  level: FatigueLevel;
  blinkRatePerMinute: number | null;
  blinkLoad: number;
  postureLoad: number;
  screenLoad: number;
  sessionLoad: number;
  combinedLoad: number;
  displayWarmth: number;
  reasons: string[];
  summary: string;
  shouldEnableSystemBlueLight: boolean;
};

export const FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD = 24;
export const FATIGUE_BLUE_LIGHT_RELEASE_THRESHOLD = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 0): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function buildBlinkLoad(blinkRatePerMinute: number | null): number {
  if (blinkRatePerMinute === null) {
    return 0;
  }

  const deficit = clamp((12 - blinkRatePerMinute) / 12, 0, 1);
  return round(deficit ** 1.15 * 38, 1);
}

function buildPostureLoad(postureState: FatigueAssessmentInput["postureState"], postureScore: number | null): number {
  const normalizedScore = clamp(postureScore ?? 0, 0, 1.2);

  if (postureState === "warning") {
    return round(clamp(14 + normalizedScore * 22, 14, 36), 1);
  }

  if (postureState === "good") {
    return round(clamp(normalizedScore * 10, 0, 10), 1);
  }

  return round(clamp(normalizedScore * 6, 0, 6), 1);
}

function buildScreenLoad(focusStretchSeconds: number): number {
  const minutes = focusStretchSeconds / 60;

  if (minutes <= 5) {
    return 0;
  }

  if (minutes <= 20) {
    return round((minutes - 5) * 0.75, 1);
  }

  if (minutes <= 40) {
    return round(11.3 + (minutes - 20) * 0.7, 1);
  }

  if (minutes <= 60) {
    return round(25.3 + (minutes - 40) * 0.25, 1);
  }

  return 30.3;
}

function buildSessionLoad(sessionScreenTimeSeconds: number): number {
  const minutes = sessionScreenTimeSeconds / 60;

  if (minutes <= 30) {
    return 0;
  }

  return round(clamp(((minutes - 30) / 210) * 10, 0, 10), 1);
}

function buildSummary(score: number, shouldEnableSystemBlueLight: boolean): string {
  if (shouldEnableSystemBlueLight) {
    return "Fatigue is high enough to warm the full laptop display.";
  }

  if (score >= 60) {
    return "Fatigue is climbing. A cooler workflow or a short reset would help.";
  }

  if (score >= 35) {
    return "Fatigue is building gradually. Keep blinking and reset your posture soon.";
  }

  return "Your live wellness signals are still in a comfortable band.";
}

export function calculateFatigueAssessment({
  blinkCount,
  trackingSeconds,
  postureState,
  postureScore,
  sessionScreenTimeSeconds,
  focusStretchSeconds,
  cameraReady
}: FatigueAssessmentInput): FatigueAssessment {
  const blinkRatePerMinute =
    cameraReady && trackingSeconds >= 45 ? round((blinkCount / Math.max(trackingSeconds, 1)) * 60, 1) : null;
  const blinkLoad = buildBlinkLoad(blinkRatePerMinute);
  const postureLoad = buildPostureLoad(postureState, postureScore);
  const screenLoad = buildScreenLoad(focusStretchSeconds);
  const sessionLoad = buildSessionLoad(sessionScreenTimeSeconds);
  const blinkFactor = clamp(blinkLoad / 38, 0, 1);
  const postureFactor = clamp(postureLoad / 36, 0, 1);
  const screenFactor = clamp(screenLoad / 30.3, 0, 1);
  const sessionFactor = clamp(sessionLoad / 10, 0, 1);
  const combinedLoad = round(
    blinkFactor * postureFactor * 8 +
      Math.max(blinkFactor, postureFactor) * screenFactor * 7 +
      screenFactor * sessionFactor * 3,
    1
  );

  const score = clamp(round(blinkLoad + postureLoad + screenLoad + sessionLoad + combinedLoad, 1), 0, 100);
  const shouldEnableSystemBlueLight = score >= FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD;
  const reasons: string[] = [];

  if (blinkRatePerMinute !== null && blinkRatePerMinute < 5) {
    reasons.push(`Blink rate is low at ${blinkRatePerMinute}/min.`);
  } else if (!cameraReady) {
    reasons.push("Camera signals are unavailable, so the score leans more on timers.");
  }

  if (postureState === "warning") {
    reasons.push("Your posture is outside the calibrated baseline.");
  }

  if (focusStretchSeconds >= 20 * 60) {
    reasons.push(`This uninterrupted screen stretch is ${Math.round(focusStretchSeconds / 60)} minutes long.`);
  }

  if (sessionLoad >= 5) {
    reasons.push(`Total session time has reached ${Math.round(sessionScreenTimeSeconds / 60)} minutes.`);
  }

  if (reasons.length === 0) {
    reasons.push("Blink cadence, posture, and timer signals are all stable right now.");
  }

  return {
    score,
    level: score < 35 ? "LOW" : score < 65 ? "MEDIUM" : "HIGH",
    blinkRatePerMinute,
    blinkLoad,
    postureLoad,
    screenLoad,
    sessionLoad,
    combinedLoad,
    displayWarmth: shouldEnableSystemBlueLight
      ? clamp(round(0.55 + (score - FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD) * 0.01, 2), 0.55, 0.85)
      : 0,
    reasons,
    summary: buildSummary(score, shouldEnableSystemBlueLight),
    shouldEnableSystemBlueLight
  };
}

export function calculateFatigueRisk(
  blinkCount: number,
  postureState: FatigueAssessmentInput["postureState"],
  screenMinutes: number
): FatigueLevel {
  return calculateFatigueAssessment({
    blinkCount,
    trackingSeconds: Math.round(screenMinutes * 60),
    postureState,
    postureScore: postureState === "warning" ? 0.6 : 0.1,
    sessionScreenTimeSeconds: Math.round(screenMinutes * 60),
    focusStretchSeconds: Math.round(screenMinutes * 60),
    cameraReady: true
  }).level;
}
