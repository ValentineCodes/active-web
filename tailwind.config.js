/** @type {import('tailwindcss').Config} */
const { lightPalette, darkPalette, paletteToCssVarRecord } = require('./src/theme/palette.js');

const semanticColors = {
  ink: 'rgb(var(--color-ink) / <alpha-value>)',
  subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
  muted: 'rgb(var(--color-muted) / <alpha-value>)',
  canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
  surface: 'rgb(var(--color-surface) / <alpha-value>)',
  elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
  hairline: 'rgb(var(--color-hairline) / <alpha-value>)',
  brand: 'rgb(var(--color-brand) / <alpha-value>)',
  'brand-strong': 'rgb(var(--color-brand-strong) / <alpha-value>)',
  'brand-soft': 'rgb(var(--color-brand-soft) / <alpha-value>)',
  active: 'rgb(var(--color-active) / <alpha-value>)',
  'active-soft': 'rgb(var(--color-active-soft) / <alpha-value>)',
  'on-brand': 'rgb(var(--color-on-brand) / <alpha-value>)',
  danger: 'rgb(var(--color-danger) / <alpha-value>)',
  'danger-soft': 'rgb(var(--color-danger-soft) / <alpha-value>)',
  warning: 'rgb(var(--color-warning) / <alpha-value>)',
  'warning-soft': 'rgb(var(--color-warning-soft) / <alpha-value>)',
  info: 'rgb(var(--color-info) / <alpha-value>)',
  'info-soft': 'rgb(var(--color-info-soft) / <alpha-value>)',
};

module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins_400Regular', 'Poppins', 'system-ui', 'sans-serif'],
      },
      colors: semanticColors,
    },
  },
  plugins: [
    ({ addUtilities }) => {
      addUtilities({
        '.font-normal': { fontFamily: 'Poppins_400Regular', fontWeight: '400' },
        '.font-medium': { fontFamily: 'Poppins_500Medium', fontWeight: '500' },
        '.font-semibold': { fontFamily: 'Poppins_600SemiBold', fontWeight: '600' },
        '.font-bold': { fontFamily: 'Poppins_700Bold', fontWeight: '700' },
      });
    },
    ({ addBase }) => {
      addBase({
        ':root': paletteToCssVarRecord(lightPalette),
        '.dark': paletteToCssVarRecord(darkPalette),
      });
    },
  ],
};
