'use client';

import { Drawer } from 'vaul';
import type { ReactNode, UIEvent } from 'react';

import {
  SheetMediaPortalHost,
  SheetMediaPortalProvider,
  useSheetMediaViewerActive,
} from '@/components/ui/SheetMediaPortalContext';
import { zIndex } from '@/design-system/layout';
import { cn } from '@/lib/cn';
import { isSheetMediaViewerTarget } from '@/lib/sheet-media-viewer-guards';

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
  tall = false,
  children,
  footer,
  className,
  contentClassName,
  onScroll,
  handleOnly = false,
  lockDismissOnMediaViewer = false,
}: {
  open: boolean;
  onClose: () => void;
  nested?: boolean;
  dismissible?: boolean;
  /** When true, only the drag handle dismisses the sheet (e.g. while a sheet overlay is open). */
  handleOnly?: boolean;
  /** Locks pan-dismiss while an in-sheet `MediaViewer` is open (uses sheet media portal context). */
  lockDismissOnMediaViewer?: boolean;
  /** Above the create composer and default sheets (matches `BottomSheet`). */
  elevated?: boolean;
  /** Taller max height for scroll-heavy sheets (e.g. profile reviews). */
  tall?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <SheetMediaPortalProvider>
      <VaulSheetBody
        nested={nested}
        open={open}
        onClose={onClose}
        dismissible={dismissible}
        handleOnly={handleOnly}
        lockDismissOnMediaViewer={lockDismissOnMediaViewer}
        elevated={elevated}
        tall={tall}
        className={className}
        contentClassName={contentClassName}
        onScroll={onScroll}
        footer={footer}
      >
        {children}
      </VaulSheetBody>
    </SheetMediaPortalProvider>
  );
}

function VaulSheetBody({
  nested,
  open,
  onClose,
  dismissible,
  handleOnly,
  lockDismissOnMediaViewer,
  elevated,
  tall,
  className,
  contentClassName,
  onScroll,
  footer,
  children,
}: {
  nested: boolean;
  open: boolean;
  onClose: () => void;
  dismissible: boolean;
  handleOnly: boolean;
  lockDismissOnMediaViewer: boolean;
  elevated: boolean;
  tall: boolean;
  className?: string;
  contentClassName?: string;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const Root = nested ? Drawer.NestedRoot : Drawer.Root;
  const layerZ = elevated ? zIndex.sheetElevated : zIndex.sheet;
  const mediaViewerActive = useSheetMediaViewerActive();
  const sheetExpanded = mediaViewerActive;
  const effectiveDismissible =
    dismissible && (!lockDismissOnMediaViewer || !mediaViewerActive);
  const effectiveHandleOnly = handleOnly || (lockDismissOnMediaViewer && mediaViewerActive);

  return (
      <Root
        open={open}
        dismissible={effectiveDismissible}
        handleOnly={effectiveHandleOnly}
        shouldScaleBackground={false}
        onOpenChange={(next) => {
          if (!next && dismissible) onClose();
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/45" style={{ zIndex: layerZ }} />
          <Drawer.Content
            className={cn(
              'fixed mx-auto flex w-full flex-col bg-elevated shadow-raised outline-none',
              sheetExpanded
                ? 'inset-0 max-h-none h-dvh max-w-none rounded-none border-0'
                : cn(
                    'inset-x-0 bottom-0 max-w-lg flex-col rounded-t-3xl border border-hairline',
                    tall ? 'max-h-[min(94dvh,720px)]' : 'max-h-[min(90dvh,640px)]',
                  ),
              className,
            )}
            style={{ zIndex: layerZ }}
            onInteractOutside={(event) => {
              if (isSheetMediaViewerTarget(event.target)) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (isSheetMediaViewerTarget(event.target)) event.preventDefault();
            }}
          >
            <div
              className={cn(
                'relative flex min-h-0 flex-1 flex-col',
                sheetExpanded && 'h-full min-h-0',
              )}
            >
              {sheetExpanded ? null : (
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline" aria-hidden />
              )}
              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto px-5 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  sheetExpanded && 'pointer-events-none overflow-hidden opacity-0',
                  contentClassName,
                )}
                onScroll={onScroll}
                aria-hidden={sheetExpanded}
              >
                {children}
              </div>
              {footer && !sheetExpanded ? (
                <footer className="shrink-0 border-t border-hairline bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {footer}
                </footer>
              ) : null}
              <SheetMediaPortalHost />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Root>
  );
}