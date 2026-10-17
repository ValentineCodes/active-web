import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

/** Renders bottom sheets above native stack / tab hosts (required on iOS). */
export function BottomSheetWindow({ children }: PropsWithChildren) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }
  return children;
}
