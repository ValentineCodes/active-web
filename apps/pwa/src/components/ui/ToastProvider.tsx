'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { zIndex } from '@/design-system/layout';
import { registerAppToast } from '@/lib/toast';
import { getColors } from '@/theme/ThemeProvider';

type ToastType = 'success' | 'danger' | 'warning' | 'info' | string | undefined;

type ToastPayload = {
  message: string;
  type?: ToastType;
  title?: string;
};

type ToastData = { title?: string } | undefined;

function toastTitle(type: ToastType, data: ToastData) {
  if (data?.title) return data.title;
  switch (type) {
    case 'success':
      return 'Done';
    case 'warning':
      return 'Heads up';
    case 'info':
      return 'Update';
    case 'danger':
      return 'Something went wrong';
    default:
      return 'Notice';
  }
}

function iconBackground(type: ToastType) {
  const colors = getColors();
  switch (type) {
    case 'success':
      return colors.activeSoft;
    case 'danger':
      return colors.dangerSoft;
    case 'warning':
      return colors.warningSoft;
    case 'info':
      return colors.infoSoft;
    default:
      return colors.surface;
  }
}

function iconColor(type: ToastType) {
  const colors = getColors();
  switch (type) {
    case 'success':
      return colors.active;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    case 'info':
      return colors.info;
    default:
      return colors.subtle;
  }
}

function iconName(type: ToastType): IonIconName {
  switch (type) {
    case 'success':
      return 'checkmark-circle';
    case 'danger':
      return 'close';
    case 'warning':
      return 'alert-circle';
    case 'info':
      return 'information-circle-outline';
    default:
      return 'notifications-outline';
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    registerAppToast((message, options) => {
      const duration = options?.duration ?? 3500;
      setToast({
        message,
        type: options?.type,
        title: options?.data?.title as string | undefined,
      });
      window.setTimeout(() => setToast(null), duration);
    });
    const onLegacy = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; title?: string; type?: string }>).detail;
      if (detail?.message) {
        setToast({ message: detail.message, title: detail.title, type: detail.type });
      }
    };
    window.addEventListener('active:toast', onLegacy);
    return () => {
      registerAppToast(null);
      window.removeEventListener('active:toast', onLegacy);
    };
  }, []);

  return (
    <>
      {children}
      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 flex justify-center px-4 pt-[max(0.5rem,env(safe-area-inset-top))]"
          style={{ zIndex: zIndex.toast }}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex w-11/12 max-w-lg flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3.5 shadow-card">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: iconBackground(toast.type) }}
            >
              <IonIcon icon={ionIcons[iconName(toast.type)]} size={20} color={iconColor(toast.type)} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base leading-5 font-semibold text-ink">
                {toast.title ?? toastTitle(toast.type, { title: toast.title })}
              </p>
              <p className="mt-0.5 text-sm leading-5 text-subtle">{toast.message}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
