import { vars } from 'nativewind';

import type { ThemePalette } from './ThemeProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paletteToCssVarRecord } = require('./palette.js') as {
  paletteToCssVarRecord: (palette: ThemePalette) => Record<string, string>;
};

/** Injects semantic colour variables for NativeWind class names (`bg-canvas`, `text-ink`, …). */
export function nativeWindThemeVars(palette: ThemePalette) {
  return vars(paletteToCssVarRecord(palette));
}
