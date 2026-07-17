import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Theme } from './tokens';
import { defaultThemeName, themes, type ThemeName } from './themes';

type ThemeContextValue = {
  theme: Theme;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultThemeName);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[themeName], themeName, setThemeName }),
    [themeName]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Returns the active theme's colors/typography plus the current theme name
// and a setter — components that only need colors can destructure `colors`
// directly, e.g. `const { colors } = useTheme()`.
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return { ...ctx.theme, themeName: ctx.themeName, setThemeName: ctx.setThemeName };
}
