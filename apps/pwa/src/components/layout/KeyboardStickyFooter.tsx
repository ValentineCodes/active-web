'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useVisualViewportKeyboardInset } from '@/lib/use-visual-viewport-keyboard-inset';

/** Scrollable body + footer pinned above the software keyboard (web auth wizards). */
export function KeyboardStickyFooter({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  const keyboardInset = useVisualViewportKeyboardInset();
  const keyboardOpen = keyboardInset > 0;

  return (
    <div
      className={cn('flex min-h-[100dvh] flex-col bg-canvas', className)}
      style={keyboardOpen ? { paddingBottom: keyboardInset } : undefined}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div
        className={cn(
          'shrink-0 bg-canvas',
          !keyboardOpen && 'pb-[max(0px,env(safe-area-inset-bottom))]',
        )}
        style={keyboardOpen ? { paddingBottom: 8 } : undefined}
      >
        {footer}
      </div>
    </div>
  );
}