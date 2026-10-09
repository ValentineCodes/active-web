import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View, type KeyboardEvent } from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

function keyboardOverlapIos(event: KeyboardEvent, layoutBottomScreenY: number) {
  const keyboardTop = event.endCoordinates.screenY;
  const fromGeometry = Math.max(0, layoutBottomScreenY - keyboardTop);
  const fromHeight = event.endCoordinates.height;
  return Math.max(fromGeometry, fromHeight);
}

/**
 * Android may shrink the window (`softwareKeyboardLayoutMode: resize`) or stay edge-to-edge.
 * Use only the gap between the layout bottom and keyboard top so we do not double-lift when
 * resize already moved the footer.
 */
function keyboardOverlapAndroid(event: KeyboardEvent, layoutBottomScreenY: number) {
  const keyboardTop = event.endCoordinates.screenY;
  return Math.max(0, layoutBottomScreenY - keyboardTop);
}

function keyboardOverlap(event: KeyboardEvent, layoutBottomScreenY: number) {
  return Platform.OS === 'android'
    ? keyboardOverlapAndroid(event, layoutBottomScreenY)
    : keyboardOverlapIos(event, layoutBottomScreenY);
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
  const frame = useSafeAreaFrame();
  const layoutBottomScreenY = frame.y + frame.height;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const lastShowEvent = useRef<KeyboardEvent | null>(null);
  const hideInsetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastShowEvent.current) return;
    setKeyboardInset(keyboardOverlap(lastShowEvent.current, layoutBottomScreenY));
  }, [layoutBottomScreenY]);

  useEffect(() => {
    const applyInset = (event: KeyboardEvent) => {
      if (hideInsetTimer.current) {
        clearTimeout(hideInsetTimer.current);
        hideInsetTimer.current = null;
      }
      lastShowEvent.current = event;
      setKeyboardInset(keyboardOverlap(event, layoutBottomScreenY));
    };

    const clearInset = () => {
      lastShowEvent.current = null;
      if (hideInsetTimer.current) clearTimeout(hideInsetTimer.current);
      // Delay so footer primary buttons still receive the first tap while the keyboard closes.
      hideInsetTimer.current = setTimeout(() => {
        setKeyboardInset(0);
        hideInsetTimer.current = null;
      }, 120);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubs = [
      Keyboard.addListener(showEvent, applyInset),
      ...(Platform.OS === 'ios' ? [Keyboard.addListener('keyboardDidShow', applyInset)] : []),
    ];
    const hideSubs = [
      Keyboard.addListener(hideEvent, clearInset),
      ...(Platform.OS === 'ios' ? [Keyboard.addListener('keyboardDidHide', clearInset)] : []),
    ];

    return () => {
      if (hideInsetTimer.current) clearTimeout(hideInsetTimer.current);
      for (const sub of [...showSubs, ...hideSubs]) {
        sub.remove();
      }
    };
  }, [layoutBottomScreenY]);

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
