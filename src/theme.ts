import { Platform } from 'react-native';

/**
 * The handful of colours that native props need as values rather than class names
 * (status bar, spinners, icon tints, native shadow colour). Mirrors the palette in
 * tailwind.config.js — change a value in exactly one of the two places, never both.
 *
 * Active's palette is deliberately narrow: one green that carries the whole brand and
 * every "go" action, warm neutrals for text and surfaces, and a small set of status
 * colours used only for their semantic meaning (never decoration).
 */
export const colors = {
  // Text & surfaces
  ink: '#111812',
  subtle: '#8A948C',
  muted: '#5C665E',
  canvas: '#FFFFFF',
  surface: '#F3F5F2',
  elevated: '#FFFFFF',
  hairline: '#E6EAE4',

  // Brand — one green, used for every primary action and the product's identity.
  brand: '#166A3D',
  brandStrong: '#0E4C2A',
  brandSoft: '#E7F4EA',

  // "Active" state — a slightly brighter green reserved for live/availability status
  // (the toggle, the connected banner, in-progress indicators) so it reads as "this is
  // happening now" without introducing a second, competing brand colour.
  active: '#1FA35A',
  activeSoft: '#E8F8EC',

  // Status
  danger: '#DC2626',
  dangerSoft: '#FDEDEC',
  warning: '#B45309',
  warningSoft: '#FDF3E3',
  info: '#2563EB',
  infoSoft: '#EAF1FE',
} as const;

/**
 * Corner radii used by native `style` props (the shadow-bearing surfaces below, mostly).
 * Everywhere else, reach for the matching Tailwind class — `rounded-2xl` (16),
 * `rounded-3xl` (24), `rounded-full` (pill) — so radius stays on one scale.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

/**
 * The app's only two elevation levels. `card` lifts a white surface a hair off the
 * canvas behind it; `raised` is for chrome that floats above scrolling content (the
 * bottom tab bar, a floating action). Everything else stays flat — flat surfaces plus
 * colour and spacing carry the hierarchy instead of stacking random shadows.
 */
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
