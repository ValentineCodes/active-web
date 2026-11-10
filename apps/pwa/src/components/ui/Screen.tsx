import { type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useIsOffline } from '@/lib/use-is-offline';

export function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const isOffline = useIsOffline();

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-canvas', className)}>
      {isOffline ? (
        <p className="border-b border-hairline bg-warning-soft py-2 text-center text-sm font-medium text-warning">
          You&apos;re offline.
        </p>
      ) : null}
      {children}
    </div>
  );
}
