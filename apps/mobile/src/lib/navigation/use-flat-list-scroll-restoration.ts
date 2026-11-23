import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useFocusEffect } from 'expo-router';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { readScrollOffset, writeScrollOffset } from '@/lib/navigation/scroll-offset-store';

export function useFlatListScrollRestoration<T>(
  storageKey: string,
  listRef: RefObject<FlatList<T> | null>,
  ready = true,
) {
  const restoredRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      restoredRef.current = false;
    }, []),
  );

  useEffect(() => {
    restoredRef.current = false;
  }, [storageKey]);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const offset = readScrollOffset(storageKey);
    if (offset <= 0) {
      restoredRef.current = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset, animated: false });
      restoredRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [listRef, ready, storageKey]);

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      writeScrollOffset(storageKey, event.nativeEvent.contentOffset.y);
    },
    [storageKey],
  );
}