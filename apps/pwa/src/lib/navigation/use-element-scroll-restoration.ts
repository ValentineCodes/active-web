'use client';

import { useCallback, useEffect, useRef, type RefObject, type UIEvent } from 'react';

import { readScrollOffset, writeScrollOffset } from '@/lib/navigation/scroll-offset-store';

export function useElementScrollRestoration(
  storageKey: string,
  ref: RefObject<HTMLElement | null>,
  ready = true,
) {
  const restoredRef = useRef(false);

  useEffect(() => {
    restoredRef.current = false;
  }, [storageKey]);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const el = ref.current;
    if (!el) return;
    const offset = readScrollOffset(storageKey);
    if (offset <= 0) {
      restoredRef.current = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = offset;
      restoredRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, ref, storageKey]);

  return useCallback(
    (event: UIEvent<HTMLElement>) => {
      writeScrollOffset(storageKey, event.currentTarget.scrollTop);
    },
    [storageKey],
  );
}