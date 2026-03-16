import {
  FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD,
  calculateFatigueAssessment
} from "./fatigue";

describe("fatigue assessment", () => {
  it("stays low when posture is stable, the session is short, and blink cadence is healthy", () => {
    const assessment = calculateFatigueAssessment({
      blinkCount: 18,
      trackingSeconds: 90,
      postureState: "good",
      postureScore: 0.08,
      sessionScreenTimeSeconds: 12 * 60,
      focusStretchSeconds: 8 * 60,
      cameraReady: true
    });

    expect(assessment.level).toBe("LOW");
    expect(assessment.score).toBeLessThan(35);
    expect(assessment.shouldEnableSystemBlueLight).toBe(false);
  });

  it("crosses the blue-light threshold when blink, posture, and focus stretch are all poor", () => {
    const assessment = calculateFatigueAssessment({
      blinkCount: 2,
      trackingSeconds: 120,
      postureState: "warning",
      postureScore: 0.88,
      sessionScreenTimeSeconds: 130 * 60,
      focusStretchSeconds: 42 * 60,
      cameraReady: true
    });

    expect(assessment.level).toBe("HIGH");
    expect(assessment.score).toBeGreaterThanOrEqual(FATIGUE_BLUE_LIGHT_ACTIVATE_THRESHOLD);
    expect(assessment.shouldEnableSystemBlueLight).toBe(true);
    expect(assessment.blinkRatePerMinute).toBe(1);
  });

  it("falls back to timer-led scoring while camera data is unavailable", () => {
    const assessment = calculateFatigueAssessment({
      blinkCount: 0,
      trackingSeconds: 0,
      postureState: "unknown",
      postureScore: null,
      sessionScreenTimeSeconds: 75 * 60,
      focusStretchSeconds: 24 * 60,
      cameraReady: false
    });

    expect(assessment.blinkRatePerMinute).toBeNull();
    expect(assessment.reasons[0]).toContain("Camera signals are unavailable");
    expect(assessment.shouldEnableSystemBlueLight).toBe(false);
  });

  it("keeps climbing gradually as the uninterrupted screen stretch gets longer", () => {
    const early = calculateFatigueAssessment({
      blinkCount: 8,
      trackingSeconds: 120,
      postureState: "good",
      postureScore: 0.18,
      sessionScreenTimeSeconds: 20 * 60,
      focusStretchSeconds: 9 * 60,
      cameraReady: true
    });

    const later = calculateFatigueAssessment({
      blinkCount: 8,
      trackingSeconds: 120,
      postureState: "good",
      postureScore: 0.18,
      sessionScreenTimeSeconds: 20 * 60,
      focusStretchSeconds: 19 * 60,
      cameraReady: true
    });

    expect(later.score).toBeGreaterThan(early.score);
    expect(later.score).not.toBe(8);
    expect(later.score).not.toBe(38);
  });
});
