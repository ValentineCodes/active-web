import { useEffect } from 'react';
import { useSegments } from 'expo-router';

import { noteActiveTabSegment } from '@/features/navigation/create-tab-return';

/** Remembers the last main tab so closing the create composer can restore it. */
export function useTrackTabForCreateReturn() {
  const segments = useSegments();

  useEffect(() => {
    noteActiveTabSegment(segments);
  }, [segments]);
}
