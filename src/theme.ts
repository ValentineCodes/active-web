/**
 * The handful of colours that native props need as values rather than class names
 * (status bar, spinners, icon tints). Mirrors the palette in tailwind.config.js.
 */
export const colors = {
  ink: '#0B0F14',
  canvas: '#FFFFFF',
  surface: '#F6F7F9',
  hairline: '#E4E7EB',
  muted: '#6B7280',
  brand: '#2563EB',
  active: '#10B981',
  danger: '#DC2626',
  warning: '#B45309',
} as const;
