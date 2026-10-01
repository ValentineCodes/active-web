import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { darkPalette, lightPalette } = require('./palette.js') as {
  lightPalette: { ink: string; active: string };
  darkPalette: { brand: string; active: string };
};

function shadowFor(scheme: 'light' | 'dark') {
  const tint = scheme === 'dark' ? darkPalette.brand : lightPalette.ink;
  return Platform.select({
    ios: {
      card: {
        shadowColor: tint,
        shadowOpacity: scheme === 'dark' ? 0.12 : 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      raised: {
        shadowColor: scheme === 'dark' ? darkPalette.active : lightPalette.ink,
        shadowOpacity: scheme === 'dark' ? 0.35 : 0.1,
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
}

export const lightShadow = shadowFor('light');
export const darkShadow = shadowFor('dark');
