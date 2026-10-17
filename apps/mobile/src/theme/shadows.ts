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
        shadowOpacity: scheme === 'dark' ? 0.03 : 0.06,
        shadowRadius: scheme === 'dark' ? 6 : 16,
        shadowOffset: { width: 0, height: scheme === 'dark' ? 2 : 6 },
      },
      raised: {
        shadowColor: scheme === 'dark' ? darkPalette.active : lightPalette.ink,
        shadowOpacity: scheme === 'dark' ? 0.18 : 0.1,
        shadowRadius: scheme === 'dark' ? 12 : 24,
        shadowOffset: { width: 0, height: scheme === 'dark' ? 4 : 8 },
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
