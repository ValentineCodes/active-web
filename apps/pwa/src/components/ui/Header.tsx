'use client';

import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

export function Header({
  title,
  onBack,
  onClose,
  right,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: ReactNode;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 flex-row items-center gap-2 px-4 pb-3',
        onBack ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : 'pt-3',
      )}
    >
      {onBack ? (
        <IconButton icon="chevron-back" accessibilityLabel="Go back" onClick={onBack} />
      ) : null}
      <h1 className={cn('min-w-0 flex-1 truncate text-lg font-bold text-ink', !onBack && 'ml-1')}>{title}</h1>
      {right}
      {onClose ? <IconButton icon="close" accessibilityLabel="Close" onClick={onClose} /> : null}
    </header>
  );
}
