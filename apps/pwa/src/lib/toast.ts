type ToastType = 'success' | 'danger' | 'warning' | 'info';

type ToastShow = (
  message: string,
  options?: { type?: ToastType; duration?: number; data?: { title?: string } },
) => void;

let showToast: ToastShow | null = null;

export function registerAppToast(next: ToastShow | null) {
  showToast = next;
}

const DEFAULT_DURATION_MS = 3500;

type ShowAppToastOptions = {
  type?: ToastType;
  duration?: number;
  title?: string;
};

export function showAppToast(message: string, options?: ToastType | ShowAppToastOptions) {
  const normalized: ShowAppToastOptions =
    typeof options === 'string' ? { type: options } : (options ?? {});
  const { type = 'success', duration = DEFAULT_DURATION_MS, title } = normalized;
  showToast?.(message, {
    type,
    duration,
    data: title ? { title } : undefined,
  });
  if (!showToast && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('active:toast', { detail: { message, type, title } }),
    );
  }
}
