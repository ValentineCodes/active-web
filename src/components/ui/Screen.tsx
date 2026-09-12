import { useSyncExternalStore, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onlineManager } from '@tanstack/react-query';

import { cn } from '@/lib/cn';

export function useIsOffline() {
  return !useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * Page frame. Carries the one piece of chrome every screen needs: a standing notice
 * when the device is offline, so a stale list is never mistaken for the current state.
 */
export function Screen({
  children,
  className,
  edges = ['top'],
}: {
  children: ReactNode;
  className?: string;
  edges?: ('top' | 'bottom')[];
}) {
  const isOffline = useIsOffline();

  return (
    <SafeAreaView edges={edges} className={cn('flex-1 bg-canvas', className)}>
      {isOffline ? (
        <View className="border-b border-hairline bg-warning-soft px-5 py-2">
          <Text className="text-center text-sm font-medium text-warning">
            You&apos;re offline. Showing the last information we have.
          </Text>
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}
