// "Nocturne" dark palette — higher-contrast revision extracted from the
// updated design artifact's "4a" screen ("Detail — Nocturne (high contrast)").
// Deepens the ground and lightens muted text/borders vs the original mock
// (docs/mock-reference.html, data-screen-label="Nocturne Detail") for better
// legibility. positive/negative/chartPalette aren't shown in that screen —
// derived by applying the same lightening delta observed on `accent`.
// See docs/superpowers/specs/2026-07-16-portfolio-comparison-design.md for the product spec.
import type { Theme } from '../tokens';

export const nocturneTheme: Theme = {
  name: 'nocturne',
  colors: {
    background: '#12131e',
    surface: '#1c1e2c',
    surfaceMuted: '#232532',
    border: '#3a3d54',
    borderStrong: '#454968',
    borderSubtle: '#262a3d',
    textPrimary: '#f2f2f5',
    textSecondary: '#c3c6da',
    textMuted: '#9498b0',
    accent: '#a89bec',
    accentSoft: '#e3defc',
    negative: '#f79e9a',
    positive: '#96d6ab',
    chartPalette: ['#a89bec', '#96d6ab', '#f7bc7a', '#85bfeb', '#f79e9a', '#e0bbf3'],
    scrim: 'rgba(10,11,18,0.55)',
  },
  typography: {
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
  },
};
