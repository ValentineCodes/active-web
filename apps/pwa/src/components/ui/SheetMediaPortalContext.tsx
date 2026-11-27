'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { zIndex } from '@/design-system/layout';

type SheetMediaPortalContextValue = {
  host: HTMLElement | null;
  setHostNode: (node: HTMLElement | null) => void;
  mediaViewerActive: boolean;
  registerMediaViewer: () => void;
  unregisterMediaViewer: () => void;
};

const SheetMediaPortalContext = createContext<SheetMediaPortalContextValue | null>(null);

export function SheetMediaPortalProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const setHostNode = useCallback((node: HTMLElement | null) => {
    setHost(node);
  }, []);
  const registerMediaViewer = useCallback(() => {
    setViewerCount((count) => count + 1);
  }, []);
  const unregisterMediaViewer = useCallback(() => {
    setViewerCount((count) => Math.max(0, count - 1));
  }, []);
  const mediaViewerActive = viewerCount > 0;
  const value = useMemo(
    () => ({
      host,
      setHostNode,
      mediaViewerActive,
      registerMediaViewer,
      unregisterMediaViewer,
    }),
    [host, setHostNode, mediaViewerActive, registerMediaViewer, unregisterMediaViewer],
  );

  return (
    <SheetMediaPortalContext.Provider value={value}>{children}</SheetMediaPortalContext.Provider>
  );
}

export function useInsideSheetMediaPortal(): boolean {
  return useContext(SheetMediaPortalContext) !== null;
}

export function useSheetMediaPortalHost(): HTMLElement | null {
  return useContext(SheetMediaPortalContext)?.host ?? null;
}

export function useSheetMediaPortalContext(): SheetMediaPortalContextValue | null {
  return useContext(SheetMediaPortalContext);
}

export function useSheetMediaViewerActive(): boolean {
  return useContext(SheetMediaPortalContext)?.mediaViewerActive ?? false;
}

/** Overlay host inside `Drawer.Content` (stays in the dialog tree; sized when sheet goes fullscreen). */
export function SheetMediaPortalHost() {
  const ctx = useContext(SheetMediaPortalContext);
  if (!ctx) return null;

  return (
    <div
      ref={ctx.setHostNode}
      className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto"
      style={{ zIndex: zIndex.mediaViewer }}
    />
  );
}