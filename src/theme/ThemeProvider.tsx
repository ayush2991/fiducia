import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getThemePreference, setThemePreference as persistThemePreference } from '@/lib/api/settings';
import type { Theme } from './tokens';
import { themes, type ThemeName } from './themes';

export type ThemePreference = 'light' | 'dark' | 'system';

function resolveThemeName(
  preference: ThemePreference,
  systemScheme: ReturnType<typeof useColorScheme>
): ThemeName {
  if (preference === 'light') return 'daybreak';
  if (preference === 'dark') return 'nocturne';
  return systemScheme === 'light' ? 'daybreak' : 'nocturne';
}

type ThemeContextValue = {
  theme: Theme;
  themeName: ThemeName;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Defaults to 'system' synchronously so the common/default path resolves
  // correctly on first paint (useColorScheme() is already available then) —
  // a persisted explicit override, if any, is hydrated below without a
  // visible flash for everyone else.
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    getThemePreference().then((stored) => {
      if (!cancelled && stored) setThemePreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemePreference = (preference: ThemePreference) => {
    setThemePreferenceState(preference);
    persistThemePreference(preference).catch((error) => {
      console.warn('setThemePreference: failed to persist preference', error);
    });
  };

  const themeName = resolveThemeName(themePreference, systemScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[themeName], themeName, themePreference, setThemePreference }),
    [themeName, themePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Returns the active theme's colors/typography plus the current theme name,
// the user's raw preference, and a setter — components that only need
// colors can destructure `colors` directly, e.g. `const { colors } = useTheme()`.
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return {
    ...ctx.theme,
    themeName: ctx.themeName,
    themePreference: ctx.themePreference,
    setThemePreference: ctx.setThemePreference,
  };
}
