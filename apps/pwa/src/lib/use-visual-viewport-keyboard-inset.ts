'use client';

import { useEffect, useRef, useState } from 'react';

/** Ignore small visualViewport shifts (mobile browser chrome). */
const KEYBOARD_MIN_OVERLAP_PX = 48;

function readKeyboardOverlap(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/** Lifts sticky footers above the software keyboard on mobile web (sign-in, wizards). */
export function useVisualViewportKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const apply = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      const overlap = readKeyboardOverlap();
      setInset(overlap >= KEYBOARD_MIN_OVERLAP_PX ? overlap : 0);
    };

    const scheduleClear = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // Keep the lift briefly so footer buttons still receive the first tap while the keyboard closes.
      hideTimer.current = setTimeout(() => {
        setInset(0);
        hideTimer.current = null;
      }, 120);
    };

    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    document.addEventListener('focusin', apply);
    document.addEventListener('focusout', scheduleClear);
    apply();

    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.removeEventListener('focusin', apply);
      document.removeEventListener('focusout', scheduleClear);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return inset;
}