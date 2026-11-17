'use client';

import { usePathname } from '@/lib/navigation';
import { useEffect } from 'react';

import { noteActiveTabPath } from '@/features/navigation/create-tab-return';

export function useTrackTabForCreateReturn() {
  const pathname = usePathname();

  useEffect(() => {
    noteActiveTabPath(pathname);
  }, [pathname]);
}
