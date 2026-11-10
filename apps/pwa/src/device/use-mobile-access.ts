import { useSyncExternalStore } from 'react';

import { readMobileAccessFromWindow } from '@/device/mobile-access';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  const coarse = window.matchMedia('(pointer: coarse)');
  const hover = window.matchMedia('(hover: none)');
  const fine = window.matchMedia('(pointer: fine)');
  const hoverYes = window.matchMedia('(hover: hover)');
  coarse.addEventListener('change', onStoreChange);
  hover.addEventListener('change', onStoreChange);
  fine.addEventListener('change', onStoreChange);
  hoverYes.addEventListener('change', onStoreChange);
  return () => {
    window.removeEventListener('resize', onStoreChange);
    coarse.removeEventListener('change', onStoreChange);
    hover.removeEventListener('change', onStoreChange);
    fine.removeEventListener('change', onStoreChange);
    hoverYes.removeEventListener('change', onStoreChange);
  };
}

/** SSR/preview snapshot: allow render until the client hydrates. */
function getServerSnapshot() {
  return true;
}

export function useMobileAccess(): boolean {
  return useSyncExternalStore(subscribe, () => readMobileAccessFromWindow(window), getServerSnapshot);
}
