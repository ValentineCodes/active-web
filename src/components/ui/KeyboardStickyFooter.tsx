import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={cn('flex-1', className)}
    >
      <View className="min-h-0 flex-1">{children}</View>
      <View
        className="bg-canvas"
        style={{
          flexShrink: 0,
          paddingBottom: Platform.OS === 'android' ? insets.bottom : 0,
          ...(Platform.OS === 'android' ? { elevation: 12, zIndex: 1 } : null),
        }}
      >
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}
