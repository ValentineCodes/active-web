import { Platform } from 'react-native';

/**
 * Native props (spinners, icons, switches, shadows) read colours at runtime via
 * `useTheme()` / `useColors()`. Tailwind class names resolve the same tokens through
 * CSS variables defined in global.css (see tailwind.config.js).
 */
export {
  ThemeProvider,
  getColors,
  useColors,
  useTheme,
  lightPalette,
  darkPalette,
  type ThemePalette,
} from './theme/ThemeProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lightPalette } = require('./theme/palette.js') as {
  lightPalette: import('./theme/ThemeProvider').ThemePalette;
};

/** @deprecated Use `useColors()` inside components or `getColors()` elsewhere. */
export const colors = lightPalette;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const shadow = Platform.select({
  ios: {
    card: {
      shadowColor: '#0B1F13',
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    raised: {
      shadowColor: '#0B1F13',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
    },
  },
  android: {
    card: { elevation: 3 },
    raised: { elevation: 10 },
  },
  default: { card: {}, raised: {} },
}) as { card: object; raised: object };
