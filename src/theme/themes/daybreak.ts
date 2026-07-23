// "Daybreak" light palette — the light-mode counterpart to Nocturne,
// extracted from the updated design artifact's "4b" screen ("Detail — Light
// (high contrast)"), with the screen-level ground/surfaceMuted values filled
// in from the artifact's earlier "3a"/"3b" light-mode pass (4b only mocks
// the Detail card, not full screen chrome). Deepens the accent purple and
// darkens muted text/borders vs 3a/3b for legibility against a white card.
// positive/negative/chartPalette aren't shown in the artifact at all —
// hand-picked for >=4.5:1 contrast against `surface`/`background`.
// See docs/superpowers/specs/2026-07-16-portfolio-comparison-design.md for the product spec.
import type { Theme } from '../tokens';

export const daybreakTheme: Theme = {
  name: 'daybreak',
  colors: {
    background: '#f3f3f8',
    surface: '#ffffff',
    surfaceMuted: '#eceef5',
    border: '#d5d7e6',
    borderStrong: '#c7c9dc',
    borderSubtle: '#e4e4ee',
    textPrimary: '#101120',
    textSecondary: '#52566b',
    textMuted: '#6f7386',
    accent: '#5847b8',
    accentSoft: '#4f3fc4',
    negative: '#c23b3b',
    positive: '#1f8a54',
    chartPalette: ['#5847b8', '#1f8a54', '#b06f1e', '#2f6fb0', '#c23b3b', '#8a4bb0'],
    scrim: 'rgba(16,17,32,0.35)',
  },
  typography: {
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
  },
};
