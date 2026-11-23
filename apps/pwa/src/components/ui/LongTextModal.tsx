'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';

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
        <h2 id="long-text-modal-title" className="shrink-0 text-lg font-bold text-ink">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="whitespace-pre-wrap text-base leading-6 text-ink">{body}</p>
        </div>
        <Button label="Done" variant="secondary" size="md" className="shrink-0" onClick={onClose} />
      </div>
    </div>
  );
}