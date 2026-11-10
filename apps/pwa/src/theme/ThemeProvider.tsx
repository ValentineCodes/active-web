'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { darkPalette, lightPalette, type ThemePalette } from '@/design-system/palette';
import {
  readThemePreference,
  resolveThemeScheme,
  writeThemePreference,
  type ThemePreference,
} from '@/theme/preferences';

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  colors: ThemePalette;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

let runtimeColors: ThemePalette = lightPalette;

export function getColors(): ThemePalette {
  return runtimeColors;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setPreferenceState(readThemePreference());
  }, []);

  const applyScheme = useCallback((scheme: 'light' | 'dark') => {
    const root = document.documentElement;
    root.classList.toggle('dark', scheme === 'dark');
    runtimeColors = scheme === 'dark' ? darkPalette : lightPalette;
    setResolved(scheme);
  }, []);

  useEffect(() => {
    applyScheme(resolveThemeScheme(preference));
  }, [applyScheme, preference]);

  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyScheme(resolveThemeScheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [applyScheme, preference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      writeThemePreference(next);
      setPreferenceState(next);
      applyScheme(resolveThemeScheme(next));
    },
    [applyScheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      colors: resolved === 'dark' ? darkPalette : lightPalette,
      setPreference,
    }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function useColors(): ThemePalette {
  return useTheme().colors;
}
