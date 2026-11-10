import { useRegisterSW } from 'virtual:pwa-register/react';

import { Button } from '@/components/ui/Button';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_MS);
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error);
    },
  });

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
            void updateServiceWorker(true);
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
