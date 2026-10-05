import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Scroll padding below list content on tab screens. iOS native tabs overlay the screen;
 * nested lists (notifications) do not always get automatic insets.
 */
const IOS_TAB_BAR_SCROLL_CLEARANCE = 40;

/** JS tab bar on web (`HomeTabBar` icon row). */
const WEB_TAB_BAR_HEIGHT = 48;

/**
 * Distance from the screen bottom to the FAB’s bottom edge on iOS — clears the floating
 * tab pill, which sits in the home-indicator region rather than a full 49pt bar stack.
 */
const IOS_FAB_BOTTOM_CLEARANCE = 10;

/** Home create FAB inset from the screen edge (matches horizontal placement). */
export const FAB_EDGE_INSET = 20;

export function useTabBarScrollPadding(extra = 8) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'ios') {
    return insets.bottom + IOS_TAB_BAR_SCROLL_CLEARANCE + extra;
  }

  if (Platform.OS === 'web') {
    return insets.bottom + WEB_TAB_BAR_HEIGHT + extra;
  }

  return extra;
}

/** Absolute `bottom` for controls that sit just above the tab bar (e.g. home FAB). */
export function useFabBottomOffset(gap = 4) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'ios') {
    return insets.bottom + IOS_FAB_BOTTOM_CLEARANCE + gap;
  }

  if (Platform.OS === 'web') {
    return insets.bottom + WEB_TAB_BAR_HEIGHT + gap;
  }

  return FAB_EDGE_INSET;
}
