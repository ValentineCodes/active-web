import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui/IconButton';

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
    <header className="flex flex-row items-center gap-2 px-4 py-3">
      {onBack ? <IconButton icon="chevron-back" accessibilityLabel="Go back" onClick={onBack} /> : null}
      <h1 className={`min-w-0 flex-1 truncate text-xl font-bold text-ink ${onBack ? '' : 'ml-1'}`}>
        {title}
      </h1>
      {right}
      {onClose ? <IconButton icon="close" accessibilityLabel="Close" onClick={onClose} /> : null}
    </header>
  );
}
