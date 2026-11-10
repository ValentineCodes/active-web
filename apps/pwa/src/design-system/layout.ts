/** Mirrors `apps/mobile/src/theme.ts` radius scale. */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

/** Common screen / component spacing — matches native class usage (`px-5`, `p-8`, etc.). */
export const spacing = {
  screenX: 20,
  screenY: 16,
  cardPadding: 20,
  sectionGap: 12,
  stackGap: 8,
} as const;

export const iconSize = {
  tab: 24,
  tabCreate: 28,
  emptyState: 28,
  toast: 20,
  inline: 18,
} as const;

/** Modal / sheet backdrop — iOS-style dim (native stack modals). */
export const overlayScrim = 'rgb(17 24 18 / 0.45)';

export const zIndex = {
  toast: 60,
  /** Stacked sheets / modals above the create composer (Vaul z-50). */
  sheet: 80,
  header: 10,
} as const;
