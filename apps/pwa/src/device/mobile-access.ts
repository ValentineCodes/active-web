/**
 * Mobile-only access gate (capability + viewport, not user-agent alone).
 *
 * Allows landscape phones: uses the shorter viewport edge and touch/hover hints.
 * Blocks typical desktop: fine pointer + hover at large width without coarse pointer.
 *
 * Limitations:
 * - iPadOS may request desktop site and appear as fine pointer (may be blocked).
 * - DevTools device mode can mis-report capabilities.
 * - Foldables and small tablets may be allowed or blocked at the margin.
 */

export type MobileAccessInput = {
  innerWidth: number;
  innerHeight: number;
  pointerCoarse: boolean;
  hoverNone: boolean;
  pointerFine: boolean;
  hoverHover: boolean;
};

export function evaluateMobileAccess(input: MobileAccessInput): boolean {
  const shortEdge = Math.min(input.innerWidth, input.innerHeight);
  const narrowViewport = input.innerWidth <= 900 || shortEdge <= 900;
  const touchLike = input.pointerCoarse || input.hoverNone;

  const likelyDesktop =
    input.innerWidth >= 1024 &&
    input.pointerFine &&
    input.hoverHover &&
    !input.pointerCoarse &&
    !input.hoverNone;

  if (likelyDesktop) return false;

  return touchLike || narrowViewport;
}

export function readMobileAccessFromWindow(window: Window): boolean {
  return evaluateMobileAccess({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
    hoverNone: window.matchMedia('(hover: none)').matches,
    pointerFine: window.matchMedia('(pointer: fine)').matches,
    hoverHover: window.matchMedia('(hover: hover)').matches,
  });
}
