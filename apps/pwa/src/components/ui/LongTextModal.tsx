'use client';

import { useEffect } from 'react';

import { IconButton } from '@/components/ui/IconButton';

type Props = {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
};

export function LongTextModal({ open, title, body, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="shadow-raised flex max-h-[min(70dvh,28rem)] w-full max-w-lg flex-col gap-4 rounded-2xl border border-hairline bg-elevated p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="long-text-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-9 shrink-0 flex-row items-center justify-between gap-3">
          <h2 id="long-text-modal-title" className="min-w-0 flex-1 text-lg font-bold leading-6 text-ink">
            {title}
          </h2>
          <IconButton
            icon="close"
            accessibilityLabel="Close"
            onClick={onClose}
            size={36}
            iconSize={22}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="whitespace-pre-wrap text-base leading-6 text-ink">{body}</p>
        </div>
      </div>
    </div>
  );
}