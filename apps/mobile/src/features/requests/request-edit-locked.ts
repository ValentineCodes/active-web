import { showAppToast } from '@/lib/toast';

export const REQUEST_EDIT_LOCKED_TITLE = 'This request can no longer be edited';

export const REQUEST_EDIT_LOCKED_MESSAGE =
  'Someone has already responded to your request. To keep things fair, the details are now locked.';

const LOCKED_SERVER_MESSAGE = 'this request can no longer be edited';

export function isRequestEditLockedError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false;
  const message = (error as { message: unknown }).message;
  if (typeof message !== 'string') return false;
  return message.toLowerCase().includes(LOCKED_SERVER_MESSAGE);
}

export function showRequestEditLockedToast() {
  showAppToast(REQUEST_EDIT_LOCKED_MESSAGE, {
    type: 'warning',
    title: REQUEST_EDIT_LOCKED_TITLE,
  });
}
