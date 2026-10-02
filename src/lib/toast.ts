type ToastType = 'success' | 'danger' | 'warning' | 'info';

type ToastShow = (
  message: string,
  options?: { type?: ToastType; duration?: number; data?: { title?: string } },
) => void;

let showToast: ToastShow | null = null;

/** Registered by ToastProvider; do not call directly from UI. */
export function registerAppToast(next: ToastShow | null) {
  showToast = next;
}

const DEFAULT_DURATION_MS = 3500;

type ShowAppToastOptions = {
  type?: ToastType;
  duration?: number;
  title?: string;
};

/** Short-lived in-app feedback. Not stored in notification_inbox. */
export function showAppToast(message: string, options?: ToastType | ShowAppToastOptions) {
  const normalized: ShowAppToastOptions =
    typeof options === 'string' ? { type: options } : (options ?? {});
  const { type = 'success', duration = DEFAULT_DURATION_MS, title } = normalized;
  showToast?.(message, {
    type,
    duration,
    data: title ? { title } : undefined,
  });
}
