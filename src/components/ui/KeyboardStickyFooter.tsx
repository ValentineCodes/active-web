import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard, Platform, View, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

function keyboardOverlap(event: KeyboardEvent, bottomSafeInset: number) {
  const height = event.endCoordinates.height;
  if (Platform.OS === 'ios') {
    return Math.max(0, height - bottomSafeInset);
  }
  return height;
}

/** Wizard-style layout: main content scrolls; footer stays above the software keyboard. */
export function KeyboardStickyFooter({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(keyboardOverlap(event, insets.bottom));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  const footerSafePadding = keyboardInset > 0 ? 0 : insets.bottom;

  return (
    <View className={cn('flex-1', className)} style={{ paddingBottom: keyboardInset }}>
      <View className="min-h-0 flex-1">{children}</View>
      <View
        className="bg-canvas"
        style={{
          flexShrink: 0,
          paddingBottom: footerSafePadding,
        }}
      >
        {footer}
      </View>
    </View>
  );
}
