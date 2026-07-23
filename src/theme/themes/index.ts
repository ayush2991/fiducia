import { daybreakTheme } from './daybreak';
import { nocturneTheme } from './nocturne';

export const themes = {
  nocturne: nocturneTheme,
  daybreak: daybreakTheme,
};

export type ThemeName = keyof typeof themes;

export const defaultThemeName: ThemeName = 'nocturne';
