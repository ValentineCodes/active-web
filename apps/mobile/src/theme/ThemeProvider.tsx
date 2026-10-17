import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { colorScheme, useColorScheme } from 'nativewind';
import { View } from 'react-native';

import {
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from '@/features/theme/preferences';

import { nativeWindThemeVars } from './css-vars';
import { darkShadow, lightShadow } from './shadows';

// palette.js is the single source for token values (also consumed by tailwind.config.js).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { darkPalette, lightPalette } = require('./palette.js') as {
  lightPalette: ThemePalette;
  darkPalette: ThemePalette;
};

export type ThemePalette = {
  ink: string;
  subtle: string;
  muted: string;
  canvas: string;
  surface: string;
  elevated: string;
  hairline: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  active: string;
  activeSoft: string;
  onBrand: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  notificationChipBlueBg: string;
  notificationChipBlueFg: string;
  notificationChipPurpleBg: string;
  notificationChipPurpleFg: string;
  notificationChipGreenBg: string;
  notificationChipGreenFg: string;
  notificationChipAmberBg: string;
  notificationChipAmberFg: string;
  notificationChipRedBg: string;
  notificationChipRedFg: string;
  switchTrackOn: string;
  switchTrackOff: string;
  switchThumb: string;
};

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  colors: ThemePalette;
  shadow: typeof lightShadow;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

let runtimeColors: ThemePalette = lightPalette;

export function getColors(): ThemePalette {
  return runtimeColors;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme: systemScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void readThemePreference().then((stored) => {
      setPreferenceState(stored);
      colorScheme.set(stored);
    });
  }, []);

  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const colors = resolved === 'dark' ? darkPalette : lightPalette;
  const shadow = resolved === 'dark' ? darkShadow : lightShadow;

  useEffect(() => {
    runtimeColors = colors;
  }, [colors]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    await writeThemePreference(next);
    setPreferenceState(next);
    colorScheme.set(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, colors, shadow, setPreference }),
    [preference, resolved, colors, shadow, setPreference],
  );

  const themeVars = useMemo(() => nativeWindThemeVars(colors), [colors]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={themeVars} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}

export function useColors() {
  return useTheme().colors;
}

export { lightPalette, darkPalette };
