'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { zIndex } from '@/design-system/layout';
import { cn } from '@/lib/cn';

const DISMISS_DRAG_PX = 72;

/**
 * Web adaptation of native `@gorhom/bottom-sheet` flows — same tokens, no new chrome.
 * Reference: `apps/mobile/src/components/ui/BottomSheetWindow.tsx` + sheet screens.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  dismissible = true,
  children,
  footer,
  className,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  /** When false, backdrop, drag, and Escape do not dismiss (e.g. while loading). */
  dismissible?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragPointerId = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      dragStartY.current = null;
      dragPointerId.current = null;
    }
  }, [open]);

  const tryClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') tryClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, tryClose]);

  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!dismissible) return;
    dragStartY.current = event.clientY;
    dragPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null || dragPointerId.current !== event.pointerId) return;
    setDragOffset(Math.max(0, event.clientY - dragStartY.current));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current !== event.pointerId) return;
    const startY = dragStartY.current;
    const delta = startY !== null ? Math.max(0, event.clientY - startY) : 0;
    if (delta >= DISMISS_DRAG_PX) tryClose();
    setDragOffset(0);
    dragStartY.current = null;
    dragPointerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!open || !mounted) return null;

  const sheet = (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: zIndex.sheet }}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss sheet"
        disabled={!dismissible}
        className={cn(
          'min-h-0 w-full flex-1 overlay-scrim',
          !dismissible && 'cursor-default',
        )}
        onClick={tryClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative mx-auto flex w-full max-w-lg flex-col rounded-t-3xl border border-hairline bg-elevated shadow-raised',
          className,
        )}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset === 0 ? 'transform 0.2s ease-out' : undefined,
        }}
      >
        <div
          className={cn(
            'mx-auto mt-2 h-1 w-10 shrink-0 touch-none rounded-full bg-hairline',
            dismissible ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          )}
          aria-hidden
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {title ? (
          <header className="flex flex-row items-center justify-between gap-3 border-b border-hairline px-5 pb-3 pt-3">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            <Button
              label="Close"
              variant="ghost"
              className="!w-auto shrink-0 !px-3 !py-2"
              onClick={tryClose}
              disabled={!dismissible}
            />
          </header>
        ) : null}
        <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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

  return createPortal(sheet, document.body);
}
