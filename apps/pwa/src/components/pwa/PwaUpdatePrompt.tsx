'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  const activateUpdate = useCallback(() => {
    const worker = waitingWorker.current;
    if (!worker) return;
    worker.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let disposed = false;
    let intervalId: number | undefined;

    const onControllerChange = () => {
      window.location.reload();
    };

    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        waitingWorker.current = registration.waiting;
        setNeedRefresh(true);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker.current = registration.waiting;
            setNeedRefresh(true);
          }
        });
      });
    };

    void navigator.serviceWorker.ready.then((registration) => {
      if (disposed) return;
      trackWaiting(registration);
      intervalId = window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_MS);
    });

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      disposed = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-lg flex-col gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-4 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <div>
        <p className="text-sm font-semibold text-ink">Update available</p>
        <p className="mt-1 text-sm text-muted">
          A new version of Active is ready. Reload to get the latest fixes and features.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          label="Reload now"
          onClick={() => {
            activateUpdate();
          }}
        />
        <Button
          label="Later"
          variant="secondary"
          onClick={() => {
            setNeedRefresh(false);
          }}
        />
      </div>
    </div>
  );
}
