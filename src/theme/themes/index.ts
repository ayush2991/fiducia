import { nocturneTheme } from './nocturne';

export const themes = {
  nocturne: nocturneTheme,
};

export type ThemeName = keyof typeof themes;

export const defaultThemeName: ThemeName = 'nocturne';
