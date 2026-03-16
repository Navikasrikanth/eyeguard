import {
  assessPosture,
  averageEar,
  buildPostureBaseline,
  currentBlinkBucketStart,
  extractPostureFeatures,
  type Point
} from "./heuristics";

function buildFace(overrides: Partial<Record<number, Point>> = {}): Point[] {
  const points = Array.from({ length: 468 }, () => ({ x: 0.4, y: 0.4 }));
  points[33] = { x: 0.34, y: 0.39 };
  points[160] = { x: 0.35, y: 0.37 };
  points[158] = { x: 0.37, y: 0.37 };
  points[133] = { x: 0.4, y: 0.39 };
  points[153] = { x: 0.37, y: 0.41 };
  points[144] = { x: 0.35, y: 0.41 };
  points[362] = { x: 0.58, y: 0.39 };
  points[385] = { x: 0.59, y: 0.37 };
  points[387] = { x: 0.61, y: 0.37 };
  points[263] = { x: 0.64, y: 0.39 };
  points[373] = { x: 0.61, y: 0.41 };
  points[380] = { x: 0.59, y: 0.41 };
  points[1] = { x: 0.49, y: 0.42 };
  points[10] = { x: 0.49, y: 0.23 };
  points[152] = { x: 0.49, y: 0.76 };
  Object.entries(overrides).forEach(([index, value]) => {
    if (value) {
      points[Number(index)] = value;
    }
  });
  return points;
}

function buildPose(overrides: Partial<Record<number, Point>> = {}): Point[] {
  const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  points[11] = { x: 0.35, y: 0.9, visibility: 0.98 };
  points[12] = { x: 0.65, y: 0.9, visibility: 0.98 };
  Object.entries(overrides).forEach(([index, value]) => {
    if (value) {
      points[Number(index)] = value;
    }
  });
  return points;
}

describe("monitoring heuristics", () => {
  it("computes a healthy eye aspect ratio for open eyes", () => {
    expect(averageEar(buildFace())).toBeGreaterThan(0.18);
  });

  it("uses a calibrated baseline so a neutral face stays good", () => {
    const baseline = buildPostureBaseline([
      extractPostureFeatures(buildFace(), buildPose()),
      extractPostureFeatures(buildFace(), buildPose())
    ]);
    const assessment = assessPosture(extractPostureFeatures(buildFace(), buildPose()), baseline, 0.62);
    expect(assessment.reasons).toHaveLength(0);
    expect(assessment.metrics.score).toBeLessThan(0.1);
  });

  it("flags large tilt and vertical drift relative to baseline", () => {
    const baseline = buildPostureBaseline([extractPostureFeatures(buildFace(), buildPose())]);
    const poorFace = buildFace({
      263: { x: 0.64, y: 0.49 },
      1: { x: 0.55, y: 0.58 }
    });
    const assessment = assessPosture(extractPostureFeatures(poorFace, buildPose()), baseline, 0.62);
    expect(assessment.metrics.score).toBeGreaterThan(0.2);
    expect(assessment.reasons.length).toBeGreaterThan(0);
  });

  it("flags slumped posture when shoulders compress toward the chin", () => {
    const baseline = buildPostureBaseline([extractPostureFeatures(buildFace(), buildPose())]);
    const slumpedFace = buildFace({
      1: { x: 0.49, y: 0.46 },
      152: { x: 0.49, y: 0.8 }
    });
    const slumpedPose = buildPose({
      11: { x: 0.36, y: 0.84, visibility: 0.99 },
      12: { x: 0.64, y: 0.84, visibility: 0.99 }
    });
    const assessment = assessPosture(extractPostureFeatures(slumpedFace, slumpedPose), baseline, 0.62);
    expect(assessment.reasons).toContain("slumped forward");
    expect(assessment.metrics.shoulderNeckDelta).toBeGreaterThan(0.05);
  });

  it("rounds blink buckets to the minute", () => {
    expect(currentBlinkBucketStart(new Date("2026-03-14T12:34:45.900Z"))).toBe("2026-03-14T12:34:00.000Z");
  });
});
