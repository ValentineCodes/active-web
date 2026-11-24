'use client';

import { Drawer } from 'vaul';
import type { ReactNode } from 'react';

import { zIndex } from '@/design-system/layout';
import { cn } from '@/lib/cn';

/**
 * Vaul bottom sheet — drag handle, dimmed overlay, pan-to-dismiss.
 * Use `nested` only inside an open `Drawer.Root` (e.g. create composer).
 */
export function VaulSheet({
  open,
  onClose,
  nested = false,
  dismissible = true,
  elevated = false,
  children,
  footer,
  className,
  contentClassName,
}: {
  open: boolean;
  onClose: () => void;
  nested?: boolean;
  dismissible?: boolean;
  /** Above the create composer and default sheets (matches `BottomSheet`). */
  elevated?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const Root = nested ? Drawer.NestedRoot : Drawer.Root;
  const layerZ = elevated ? zIndex.sheetElevated : zIndex.sheet;

  return (
    <Root
      open={open}
      dismissible={dismissible}
      shouldScaleBackground={false}
      onOpenChange={(next) => {
        if (!next && dismissible) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/45" style={{ zIndex: layerZ }} />
        <Drawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-lg flex-col rounded-t-3xl border border-hairline bg-elevated shadow-raised outline-none',
            'max-h-[min(90dvh,640px)]',
            className,
          )}
          style={{ zIndex: layerZ }}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline" aria-hidden />
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto px-5 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              contentClassName,
            )}
          >
            {children}
          </div>
          {footer ? (
            <footer className="shrink-0 border-t border-hairline bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Root>
  );
}