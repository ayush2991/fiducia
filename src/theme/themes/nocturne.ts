// "Nocturne" dark palette — extracted from the mockup source of truth,
// Portfolio Tracker.html (data-screen-label="Nocturne Tab Shell").
// See docs/superpowers/specs/2026-07-16-portfolio-comparison-design.md for the product spec.
import type { Theme } from '../tokens';

export const nocturneTheme: Theme = {
  name: 'nocturne',
  colors: {
    background: '#161826',
    surface: '#1c1e2c',
    surfaceMuted: '#232532',
    border: '#232532',
    borderStrong: '#2c2f40',
    borderSubtle: '#1e2030',
    textPrimary: '#e9e9ed',
    textSecondary: '#75798c',
    textMuted: '#595d6c',
    accent: '#9184d9',
    accentSoft: '#d2cefd',
    negative: '#e08787',
    positive: '#7fbf98',
    chartPalette: ['#9184d9', '#7fbf98', '#e0a567', '#6ea8d8', '#e08787', '#c9a4e0'],
  },
  typography: {
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
  },
};
