export const themeTokens = {
  colors: {
    ink: "#f7f5ef",
    slate: "#101820",
    fog: "#d9d8d2",
    sage: "#8ba888",
    ember: "#ff5f5d",
    gold: "#f3b95f",
    ocean: "#41779c"
  },
  radii: {
    large: "28px",
    medium: "20px",
    small: "14px"
  },
  shadows: {
    soft: "0 24px 60px rgba(16, 24, 32, 0.18)",
    glow: "0 12px 40px rgba(243, 185, 95, 0.25)"
  }
} as const;

export type ThemeTokens = typeof themeTokens;
