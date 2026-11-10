import { useEffect, useState } from 'react';

import { registerAppToast } from '@/lib/toast';

type ToastState = { message: string; title?: string; type?: string } | null;

export function ToastHost() {
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    registerAppToast((message, options) => {
      setToast({ message, type: options?.type, title: options?.data?.title });
      window.setTimeout(() => setToast(null), options?.duration ?? 3500);
    });
    const onLegacy = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; title?: string; type?: string }>).detail;
      if (detail?.message) setToast(detail);
    };
    window.addEventListener('active:toast', onLegacy);
    return () => {
      registerAppToast(null);
      window.removeEventListener('active:toast', onLegacy);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg rounded-xl bg-ink px-4 py-3 text-sm text-on-brand shadow-lg"
      role="status"
    >
      {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
      <p>{toast.message}</p>
    </div>
  );
}
