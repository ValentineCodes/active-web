/** Matches mobile web tab bar footprint for feed insets. */
export const TAB_BAR_HEIGHT = 56;

export function tabBarScrollPadding(): number {
  const root = document.documentElement;
  const safe = Number.parseFloat(getComputedStyle(root).getPropertyValue('padding-bottom')) || 0;
  return TAB_BAR_HEIGHT + Math.max(safe, 8);
}
