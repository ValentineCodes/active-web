'use client';

import { useEffect, useId, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { zIndex } from '@/design-system/layout';
import { cn } from '@/lib/cn';

/**
 * Web adaptation of native `@gorhom/bottom-sheet` flows — same tokens, no new chrome.
 * Reference: `apps/mobile/src/components/ui/BottomSheetWindow.tsx` + sheet screens.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
  className,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex: zIndex.sheet }} role="presentation">
      <button
        type="button"
        aria-label="Dismiss sheet"
        className="absolute inset-0 overlay-scrim"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative mx-auto flex w-full max-w-lg max-h-[min(88dvh,640px)] flex-col rounded-t-3xl border border-hairline bg-elevated shadow-raised',
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline" aria-hidden />
        {title ? (
          <header className="flex flex-row items-center justify-between gap-3 px-5 pb-2 pt-3">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            <Button label="Close" variant="ghost" className="!w-auto shrink-0 !px-3 !py-2" onClick={onClose} />
          </header>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
        {footer ? (
          <footer className="border-t border-hairline px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
