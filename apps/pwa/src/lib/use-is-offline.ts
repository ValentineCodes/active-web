import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

export function useIsOffline() {
  return !useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
