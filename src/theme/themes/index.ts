import { nocturneTheme } from './nocturne';
import { nocturneLightTheme } from './nocturne-light';

export const themes = {
  nocturne: nocturneTheme,
  'nocturne-light': nocturneLightTheme,
};

export type ThemeName = keyof typeof themes;

export const defaultThemeName: ThemeName = 'nocturne';
