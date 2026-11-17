'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useAvatarUrl } from '@/features/profile/avatar-url';
import { useCatalogueMediaUrl } from '@/features/profile/catalogue-api';
import { useConversationAttachmentUrl } from '@/features/requests/conversation-attachment-url';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { cn } from '@/lib/cn';

import type { MediaViewerItem } from './media-viewer-types';

const ITEM_DIVIDER_HEIGHT_PX = 15;
const VIDEO_BACKGROUND = '#000000';

function useResolvedMediaUri(item: MediaViewerItem): string | null {
  const storage = item.storage ?? 'catalogue';
  const catalogueUrl = useCatalogueMediaUrl(storage === 'catalogue' ? item.path : null);
  const avatarUrl = useAvatarUrl(storage === 'avatar' ? item.path : null);
  const conversationUrl = useConversationAttachmentUrl(
    storage === 'conversation' && item.path.length > 0 ? item.path : null,
  );
  const requestUrl = useRequestAttachmentUrl(storage === 'request' ? item.path : null);

  if (item.uri) return item.uri;

  if (storage === 'conversation') {
    return (
      conversationUrl.data ??
      (item.localPreviewUri &&
      (conversationUrl.isPending || conversationUrl.isError || item.path.length === 0)
        ? item.localPreviewUri
        : null)
    );
  }
  if (storage === 'avatar') return avatarUrl.data ?? null;
  if (storage === 'request') return requestUrl.data ?? null;
  return catalogueUrl.data ?? null;
}

function MediaViewerStackedItem({
  item,
  onHeight,
}: {
  item: MediaViewerItem;
  onHeight: (height: number) => void;
}) {
  const mediaUri = useResolvedMediaUri(item);
  const ref = useRef<HTMLDivElement>(null);
  const isVideo = item.kind === 'video';

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const report = () => onHeight(node.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [mediaUri, onHeight, item.kind]);

  if (!mediaUri) {
    return (
      <div
        ref={ref}
        className="flex min-h-48 w-full items-center justify-center bg-surface"
        aria-busy="true"
      >
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
          aria-label="Loading media"
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn('w-full', isVideo ? 'bg-black' : 'bg-canvas')}
    >
      {item.kind === 'photo' ? (
        <img
          src={mediaUri}
          alt={item.accessibilityLabel ?? ''}
          className="block h-auto w-full object-contain"
          decoding="async"
        />
      ) : (
        <video
          src={mediaUri}
          controls
          playsInline
          className="block w-full"
          style={{ backgroundColor: VIDEO_BACKGROUND }}
          aria-label={item.accessibilityLabel ?? 'Video'}
        />
      )}
    </div>
  );
}

function MediaViewerBody({
  items,
  initialIndex,
  onClose,
}: {
  items: MediaViewerItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [itemHeights, setItemHeights] = useState<number[]>(() => items.map(() => 0));
  const [mounted, setMounted] = useState(false);

  const setItemHeight = useCallback((index: number, height: number) => {
    setItemHeights((prev) => {
      if (prev[index] === height) return prev;
      const next = [...prev];
      next[index] = height;
      return next;
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useLayoutEffect(() => {
    if (initialIndex <= 0) return;
  const scrollEl = scrollRef.current;
  if (!scrollEl) return;

    let offset = 0;
    for (let i = 0; i < initialIndex; i++) {
      const h = itemHeights[i];
      if (!h) return;
      offset += h + ITEM_DIVIDER_HEIGHT_PX;
    }

    scrollEl.scrollTo({ top: offset, behavior: 'auto' });
  }, [initialIndex, itemHeights, mounted]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-canvas pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[52px] shrink-0 items-center justify-end px-4">
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full active:opacity-80"
          aria-label="Close"
        >
          <IonIcon icon={ionIcons.close} size={28} color="currentColor" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.map((item, index) => {
          const itemKey = item.id ?? `${item.storage ?? 'catalogue'}:${item.path}`;
          return (
            <Fragment key={itemKey}>
              {index > 0 ? (
                <div
                  className="w-full bg-surface"
                  style={{ height: ITEM_DIVIDER_HEIGHT_PX }}
                  aria-hidden
                />
              ) : null}
              <MediaViewerStackedItem
                item={item}
                onHeight={(height) => setItemHeight(index, height)}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function MediaViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: MediaViewerItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  if (items.length === 0) return null;

  const safeIndex = Math.min(Math.max(initialIndex, 0), items.length - 1);

  return createPortal(
    <MediaViewerBody items={items} initialIndex={safeIndex} onClose={onClose} />,
    document.body,
  );
}