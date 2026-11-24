'use client';

import { useLayoutEffect, useState } from 'react';

/** Floating liquid-glass pill + gap (excludes safe area; use with env(safe-area-inset-bottom)). */
export const TAB_BAR_PILL_HEIGHT = 52;
export const TAB_BAR_FLOAT_GAP = 10;
export const TAB_BAR_HEIGHT = TAB_BAR_PILL_HEIGHT + TAB_BAR_FLOAT_GAP + 8;

/** Clearance from the screen bottom to content sitting above the floating tab pill. */
export function readAppTabBarInset(extra = 0): number {
  if (typeof window === 'undefined') return TAB_BAR_HEIGHT + extra;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-tab-bar-inset').trim();
  const base = raw ? Number.parseFloat(raw) : TAB_BAR_HEIGHT + 8;
  return (Number.isFinite(base) ? base : TAB_BAR_HEIGHT + 8) + extra;
}

/** Home feed card copy — clears the overlay tab bar without shrinking the snap page. */
export function useHomeFeedTabBarInset(contentGap = 4): number {
  const [inset, setInset] = useState(() => readAppTabBarInset(contentGap));

  useLayoutEffect(() => {
    const update = () => setInset(readAppTabBarInset(contentGap));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [contentGap]);

  return inset;
}

export function tabBarScrollPadding(): number {
  return readAppTabBarInset(8);
}

/** Coach / FAB bottom offset: tab clearance only when the main tab bar is on screen. */
export function readFloatingBottomOffset(showsTabBar: boolean, compactBottomRem = 1.5): number | string {
  if (showsTabBar) return readAppTabBarInset(0);
  return `max(${compactBottomRem}rem, env(safe-area-inset-bottom, 0px))`;
}
