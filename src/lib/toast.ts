type ToastShow = (
  message: string,
  options?: { type?: 'success' | 'danger' | 'warning' | 'info'; duration?: number },
) => void;

let showToast: ToastShow | null = null;

/** Registered by ToastProvider; do not call directly from UI. */
export function registerAppToast(next: ToastShow | null) {
  showToast = next;
}

const DEFAULT_DURATION_MS = 3500;

/** Short-lived in-app feedback. Not stored in notification_inbox. */
export function showAppToast(
  message: string,
  type: 'success' | 'info' | 'warning' = 'success',
  duration = DEFAULT_DURATION_MS,
) {
  showToast?.(message, { type, duration });
}
