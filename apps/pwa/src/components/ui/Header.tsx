'use client';

import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { ScreenHeading } from '@/components/ui/ScreenHeading';

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
  if (onBack) {
    return (
      <header className="shrink-0 px-6 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex flex-row items-start justify-between gap-3">
          <ScreenHeading title={title} onBack={onBack} />
          <div className="flex shrink-0 flex-row items-center gap-1 pt-1">
            {right}
            {onClose ? <IconButton icon="close" accessibilityLabel="Close" onClick={onClose} /> : null}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-row items-center gap-2 px-4 py-3">
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-ink">{title}</h1>
      {right}
      {onClose ? <IconButton icon="close" accessibilityLabel="Close" onClick={onClose} /> : null}
    </header>
  );
}
