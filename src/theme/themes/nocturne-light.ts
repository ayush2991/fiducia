// "Nocturne Light" palette — extracted from the mockup source of truth,
// Portfolio Tracker.html (data-screen-label="Nocturne Detail" turn-3 light
// variants: opt-3a "Light — Detail", opt-3b "Light — Watchlist shell").
// Same accent family and positive/negative colors as the dark `nocturne`
// theme, recontrasted for a light surface — see docs/mock-reference.html.
import type { Theme } from '../tokens';

export const nocturneLightTheme: Theme = {
  name: 'nocturne-light',
  colors: {
    background: '#f3f3f8',
    surface: '#ffffff',
    surfaceMuted: '#eceef5',
    border: '#e4e4ee',
    borderStrong: '#c9ccd9',
    borderSubtle: '#eceef5',
    textPrimary: '#1d1f2b',
    textSecondary: '#6b6f85',
    textMuted: '#9497ab',
    accent: '#9184d9',
    accentSoft: '#6a5cc4',
    negative: '#e08787',
    positive: '#7fbf98',
    chartPalette: ['#9184d9', '#7fbf98', '#e0a567', '#6ea8d8', '#e08787', '#c9a4e0'],
    chartGridLine: '#eceef5',
    chartAxisLabel: '#9497ab',
    chartBenchmarkLine: '#c3c6d6',
    chartCursorLine: '#c9c2ef',
  },
  typography: {
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
  },
};
