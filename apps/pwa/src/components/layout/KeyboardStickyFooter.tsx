'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Scrollable body + footer pinned above safe area (web auth wizards). */
export function KeyboardStickyFooter({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-[100dvh] flex-col bg-canvas', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div className="shrink-0 bg-canvas pb-[max(0px,env(safe-area-inset-bottom))]">{footer}</div>
    </div>
  );
}
