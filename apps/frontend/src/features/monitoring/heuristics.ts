import type { PostureMetrics } from "@eyeguard/types";

export type Point = { x: number; y: number; z?: number; visibility?: number };

const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

export type PostureFeatureSnapshot = {
  rollDegrees: number;
  verticalRatio: number;
  centerOffsetRatio: number;
  leanRatio: number;
  faceWidth: number;
  faceHeight: number;
  shoulderRollDegrees: number | null;
  shoulderNeckRatio: number | null;
  upperBodyTracked: boolean;
};

export type PostureBaseline = PostureFeatureSnapshot & {
  sampleCount: number;
  shoulderSampleCount: number;
};

export type PostureAssessment = {
  reasons: string[];
  metrics: PostureMetrics;
};

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hasReliablePosePoint(point: Point | undefined): point is Point {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (point.visibility === undefined || point.visibility > 0.45)
  );
}

function pushUnique(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function eyeAspectRatio(points: Point[]): number {
  const [p1, p2, p3, p4, p5, p6] = points;
  const vertical = distance(p2, p6) + distance(p3, p5);
  const horizontal = 2 * distance(p1, p4);
  return horizontal === 0 ? 0 : vertical / horizontal;
}

export function averageEar(landmarks: Point[]): number {
  const left = eyeAspectRatio(LEFT_EYE.map((index) => landmarks[index]));
  const right = eyeAspectRatio(RIGHT_EYE.map((index) => landmarks[index]));
  return (left + right) / 2;
}

export function extractPostureFeatures(landmarks: Point[], poseLandmarks?: Point[]): PostureFeatureSnapshot {
  const leftEye = landmarks[LEFT_EYE_OUTER];
  const rightEye = landmarks[RIGHT_EYE_OUTER];
  const nose = landmarks[NOSE_TIP];
  const forehead = landmarks[FOREHEAD];
  const chin = landmarks[CHIN];
  const eyeMid = midpoint(leftEye, rightEye);
  const faceWidth = Math.max(distance(leftEye, rightEye), 0.0001);
  const faceHeight = Math.max(distance(forehead, chin), faceWidth);
  const rollRadians = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const leftShoulder = poseLandmarks?.[LEFT_SHOULDER];
  const rightShoulder = poseLandmarks?.[RIGHT_SHOULDER];
  const upperBodyTracked = hasReliablePosePoint(leftShoulder) && hasReliablePosePoint(rightShoulder);
  const shoulderMid = upperBodyTracked ? midpoint(leftShoulder, rightShoulder) : null;
  const shoulderWidth = upperBodyTracked ? Math.max(distance(leftShoulder, rightShoulder), faceWidth * 0.55, 0.0001) : 0;
  const shoulderRollRadians =
    upperBodyTracked && leftShoulder && rightShoulder
      ? Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x)
      : 0;

  return {
    rollDegrees: (rollRadians * 180) / Math.PI,
    verticalRatio: (nose.y - eyeMid.y) / faceHeight,
    centerOffsetRatio: Math.abs(nose.x - eyeMid.x) / faceWidth,
    leanRatio: faceWidth / faceHeight,
    faceWidth,
    faceHeight,
    shoulderRollDegrees: upperBodyTracked ? (shoulderRollRadians * 180) / Math.PI : null,
    shoulderNeckRatio:
      upperBodyTracked && shoulderMid ? clamp((shoulderMid.y - chin.y) / shoulderWidth, 0, 3) : null,
    upperBodyTracked
  };
}

export function buildPostureBaseline(samples: PostureFeatureSnapshot[]): PostureBaseline {
  const total = samples.reduce(
    (accumulator, sample) => {
      accumulator.rollDegrees += sample.rollDegrees;
      accumulator.verticalRatio += sample.verticalRatio;
      accumulator.centerOffsetRatio += sample.centerOffsetRatio;
      accumulator.leanRatio += sample.leanRatio;
      accumulator.faceWidth += sample.faceWidth;
      accumulator.faceHeight += sample.faceHeight;
      if (sample.upperBodyTracked && sample.shoulderRollDegrees !== null && sample.shoulderNeckRatio !== null) {
        accumulator.shoulderRollDegrees += sample.shoulderRollDegrees;
        accumulator.shoulderNeckRatio += sample.shoulderNeckRatio;
        accumulator.shoulderSampleCount += 1;
      }
      return accumulator;
    },
    {
      rollDegrees: 0,
      verticalRatio: 0,
      centerOffsetRatio: 0,
      leanRatio: 0,
      faceWidth: 0,
      faceHeight: 0,
      shoulderRollDegrees: 0,
      shoulderNeckRatio: 0,
      shoulderSampleCount: 0
    }
  );

  const count = Math.max(samples.length, 1);
  const shoulderCount = Math.max(total.shoulderSampleCount, 1);
  return {
    rollDegrees: total.rollDegrees / count,
    verticalRatio: total.verticalRatio / count,
    centerOffsetRatio: total.centerOffsetRatio / count,
    leanRatio: total.leanRatio / count,
    faceWidth: total.faceWidth / count,
    faceHeight: total.faceHeight / count,
    shoulderRollDegrees: total.shoulderSampleCount > 0 ? total.shoulderRollDegrees / shoulderCount : null,
    shoulderNeckRatio: total.shoulderSampleCount > 0 ? total.shoulderNeckRatio / shoulderCount : null,
    upperBodyTracked: total.shoulderSampleCount > 0,
    sampleCount: samples.length,
    shoulderSampleCount: total.shoulderSampleCount
  };
}

function toleranceScaleFromSensitivity(sensitivity: number): number {
  return clamp(0.9 + (0.62 - sensitivity), 0.64, 1.18);
}

function contribution(delta: number, threshold: number): number {
  return Math.max(0, delta / threshold - 1);
}

export function assessPosture(
  current: PostureFeatureSnapshot,
  baseline: PostureBaseline,
  sensitivity = 0.62
): PostureAssessment {
  const toleranceScale = toleranceScaleFromSensitivity(sensitivity);
  const rollDeltaDegrees = Math.abs(current.rollDegrees - baseline.rollDegrees);
  const verticalDrift = current.verticalRatio - baseline.verticalRatio;
  const verticalDelta = Math.abs(verticalDrift);
  const centerDelta = Math.abs(current.centerOffsetRatio - baseline.centerOffsetRatio);
  const leanDelta = Math.abs(current.leanRatio - baseline.leanRatio);
  const shoulderTracked =
    current.upperBodyTracked &&
    baseline.upperBodyTracked &&
    current.shoulderRollDegrees !== null &&
    current.shoulderNeckRatio !== null &&
    baseline.shoulderRollDegrees !== null &&
    baseline.shoulderNeckRatio !== null;
  const currentShoulderRoll = shoulderTracked ? (current.shoulderRollDegrees ?? 0) : 0;
  const baselineShoulderRoll = shoulderTracked ? (baseline.shoulderRollDegrees ?? 0) : 0;
  const currentShoulderNeck = shoulderTracked ? (current.shoulderNeckRatio ?? 0) : 0;
  const baselineShoulderNeck = shoulderTracked ? (baseline.shoulderNeckRatio ?? 0) : 0;
  const shoulderRollDeltaDegrees = shoulderTracked
    ? Math.abs(currentShoulderRoll - baselineShoulderRoll)
    : 0;
  const shoulderNeckDelta = shoulderTracked
    ? Math.max(0, baselineShoulderNeck - currentShoulderNeck)
    : 0;
  const reasons: string[] = [];
  const forwardLeanDelta = current.leanRatio > baseline.leanRatio ? leanDelta : 0;

  if (rollDeltaDegrees > 5.8 * toleranceScale) {
    pushUnique(reasons, "head tilt");
  }

  if (verticalDrift > 0.024 * toleranceScale) {
    pushUnique(reasons, "head dropped below neutral");
  } else if (verticalDrift < -0.032 * toleranceScale) {
    pushUnique(reasons, "chin lifted above neutral");
  }

  if (centerDelta > 0.04 * toleranceScale) {
    pushUnique(reasons, "head shifted off-center");
  }

  if (leanDelta > 0.082 * toleranceScale) {
    pushUnique(reasons, current.leanRatio > baseline.leanRatio ? "leaning toward screen" : "leaning away from screen");
  }

  if (shoulderTracked && shoulderRollDeltaDegrees > 4.5 * toleranceScale) {
    pushUnique(reasons, "uneven shoulders");
  }

  if (shoulderTracked && shoulderNeckDelta > 0.04 * toleranceScale) {
    pushUnique(reasons, "slumped shoulders / compressed neck");
  }

  const slumpComposite = Math.max(0, verticalDrift) * 1.1 + shoulderNeckDelta * 1.15 + forwardLeanDelta * 0.9;
  if (
    slumpComposite > 0.055 * toleranceScale ||
    (verticalDrift > 0.018 * toleranceScale && forwardLeanDelta > 0.045 * toleranceScale) ||
    (shoulderTracked && shoulderNeckDelta > 0.032 * toleranceScale && verticalDrift > 0.016 * toleranceScale)
  ) {
    pushUnique(reasons, "slumped forward");
  }

  const score =
    0.24 * contribution(rollDeltaDegrees, 4.5 * toleranceScale) +
    0.22 * contribution(verticalDelta, 0.02 * toleranceScale) +
    0.1 * contribution(centerDelta, 0.026 * toleranceScale) +
    0.16 * contribution(leanDelta, 0.06 * toleranceScale) +
    0.14 * contribution(shoulderRollDeltaDegrees, 3.8 * toleranceScale) +
    0.24 * contribution(shoulderNeckDelta, 0.03 * toleranceScale) +
    (reasons.length >= 2 ? 0.22 : 0) +
    (reasons.includes("slumped forward") ? 0.12 : 0) +
    (reasons.includes("uneven shoulders") ? 0.08 : 0) +
    (reasons.includes("head tilt") ? 0.05 : 0);

  return {
    reasons,
    metrics: {
      rollDegrees: Number(current.rollDegrees.toFixed(2)),
      rollDeltaDegrees: Number(rollDeltaDegrees.toFixed(2)),
      verticalRatio: Number(current.verticalRatio.toFixed(4)),
      verticalDelta: Number(verticalDelta.toFixed(4)),
      centerOffsetRatio: Number(current.centerOffsetRatio.toFixed(4)),
      centerDelta: Number(centerDelta.toFixed(4)),
      leanRatio: Number(current.leanRatio.toFixed(4)),
      leanDelta: Number(leanDelta.toFixed(4)),
      shoulderRollDegrees: Number((current.shoulderRollDegrees ?? 0).toFixed(2)),
      shoulderRollDeltaDegrees: Number(shoulderRollDeltaDegrees.toFixed(2)),
      shoulderNeckRatio: Number((current.shoulderNeckRatio ?? 0).toFixed(4)),
      shoulderNeckDelta: Number(shoulderNeckDelta.toFixed(4)),
      score: Number(score.toFixed(3))
    }
  };
}

export function currentBlinkBucketStart(now = new Date()): string {
  const bucket = new Date(now);
  bucket.setSeconds(0, 0);
  return bucket.toISOString();
}
