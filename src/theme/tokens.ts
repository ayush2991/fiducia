// Shape shared by every theme. A theme swap means adding a new object that
// satisfies this type under src/theme/themes/ and registering it in
// src/theme/themes/index.ts — no other file needs to change.
export type ColorTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  negative: string;
  positive: string;
  // Distinct per-entity line colors for the Compare tab's overlay chart —
  // cycled through in portfolio/benchmark list order.
  chartPalette: string[];
  // Chart-internal decoration that doesn't map cleanly onto textSecondary/
  // textMuted/border — the mock tunes these independently per theme rather
  // than deriving them, so they get dedicated tokens.
  chartGridLine: string;
  chartAxisLabel: string;
  chartBenchmarkLine: string;
  chartCursorLine: string;
};

// Font weights only — per-component fontSize/letterSpacing values are tuned
// pixel-for-pixel against docs/mock-reference.html and stay local to each
// component's styles rather than being forced into a shared scale.
export type TypographyTokens = {
  weight: {
    regular: '400';
    medium: '500';
    semibold: '600';
  };
};

export type Theme = {
  name: string;
  colors: ColorTokens;
  typography: TypographyTokens;
};
