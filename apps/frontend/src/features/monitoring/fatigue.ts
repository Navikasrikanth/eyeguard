export function calculateFatigueRisk(
    blinkCount: number,
    postureState: string,
    screenMinutes: number
  ) {
    let score = 0;
  
    // low blink count
    if (blinkCount < 5) score += 25;
  
    // posture problems
    if (postureState === "warning") score += 35;
  
    // long screen usage
    if (screenMinutes > 30) score += 20;
    if (screenMinutes > 60) score += 40;
  
    if (score < 30) return "LOW";
    if (score < 60) return "MEDIUM";
    return "HIGH";
  }