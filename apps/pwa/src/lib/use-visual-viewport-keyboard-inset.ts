'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

export const KEYBOARD_FOOTER_GAP_PX = 2;

/** Ignore small visualViewport shifts (mobile browser chrome). */
const KEYBOARD_MIN_OVERLAP_PX = 48;

/** Keep sampling while the keyboard animates. */
const KEYBOARD_TRACK_MS = 450;

export const KEYBOARD_STICKY_ROOT_ATTR = 'data-keyboard-sticky-root';

function isKeyboardObscuringViewport(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  const visualBottom = vv.offsetTop + vv.height;
  return window.innerHeight - visualBottom >= KEYBOARD_MIN_OVERLAP_PX;
}

/**
 * Lift required so the footer sits {@link KEYBOARD_FOOTER_GAP_PX}px above the keyboard.
 * Uses the footer's natural bottom (current bottom + already-applied padding) so
 * measurements stay stable across frames.
 */
export function measureKeyboardFooterPadding(footerEl: HTMLElement | null): number {
  const vv = window.visualViewport;
  if (!vv || !footerEl) return 0;
  if (!isKeyboardObscuringViewport()) return 0;

  const visualBottom = vv.offsetTop + vv.height;
  const targetBottom = visualBottom - KEYBOARD_FOOTER_GAP_PX;
  const root = footerEl.closest(`[${KEYBOARD_STICKY_ROOT_ATTR}]`) as HTMLElement | null;
  const appliedPadding = root ? Number.parseFloat(root.style.paddingBottom || '0') || 0 : 0;
  const footerBottom = footerEl.getBoundingClientRect().bottom;
  const naturalBottom = footerBottom + appliedPadding;

  return Math.max(0, Math.ceil(naturalBottom - targetBottom));
}

/** Pixel lift for KeyboardStickyFooter (stable while the keyboard animates). */
export function useVisualViewportKeyboardInset(footerRef: RefObject<HTMLElement | null>): number {
  const [inset, setInset] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackFrame = useRef<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const publishInset = () => {
      setInset(measureKeyboardFooterPadding(footerRef.current));
    };

    const stopTracking = () => {
      if (trackFrame.current !== null) {
        cancelAnimationFrame(trackFrame.current);
        trackFrame.current = null;
      }
    };

    const trackDuringAnimation = () => {
      stopTracking();
      const started = performance.now();
      const frame = () => {
        publishInset();
        if (performance.now() - started < KEYBOARD_TRACK_MS) {
          trackFrame.current = requestAnimationFrame(frame);
        } else {
          trackFrame.current = null;
        }
      };
      trackFrame.current = requestAnimationFrame(frame);
    };

    const onViewportChange = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      publishInset();
      trackDuringAnimation();
    };

    const onFocusIn = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      publishInset();
      trackDuringAnimation();
    };

    const onFocusOut = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        stopTracking();
        setInset(0);
        hideTimer.current = null;
      }, 120);
    };

    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', publishInset);
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    publishInset();

    return () => {
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', publishInset);
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      stopTracking();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [footerRef]);

  return inset;
}