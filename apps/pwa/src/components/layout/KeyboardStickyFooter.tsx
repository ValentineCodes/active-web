'use client';

import { type ReactNode, useRef } from 'react';

import { cn } from '@/lib/cn';
import {
  KEYBOARD_FOOTER_GAP_PX,
  KEYBOARD_STICKY_ROOT_ATTR,
  useVisualViewportKeyboardInset,
} from '@/lib/use-visual-viewport-keyboard-inset';

/** Scrollable body + footer pinned {@link KEYBOARD_FOOTER_GAP_PX}px above the software keyboard. */
export function KeyboardStickyFooter({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  const footerRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportKeyboardInset(footerRef);
  const keyboardOpen = keyboardInset > 0;

  return (
    <div
      {...{ [KEYBOARD_STICKY_ROOT_ATTR]: '' }}
      className={cn('flex min-h-[100dvh] flex-col bg-canvas', className)}
      style={keyboardOpen ? { paddingBottom: keyboardInset } : undefined}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      <div
        ref={footerRef}
        className={cn(
          'shrink-0 bg-canvas',
          keyboardOpen ? 'pb-0' : 'pb-[max(0px,env(safe-area-inset-bottom))]',
        )}
      >
        {footer}
      </div>
    </div>
  );
}