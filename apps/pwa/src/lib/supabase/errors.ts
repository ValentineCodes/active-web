import {
  isRequestEditLockedError,
  REQUEST_EDIT_LOCKED_MESSAGE,
} from '@/features/requests/request-edit-locked';

const INTENTIONAL_ERROR_CODES = new Set([
  '42501',
  '22023',
  '55000',
  'P0002',
  '23505',
  '23514',
]);

const NETWORK_MESSAGE = 'You appear to be offline. Check your connection and try again.';
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function isInsufficientWalletBalanceError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') {
      const lower = message.toLowerCase();
      return (
        lower.includes('insufficient wallet balance') ||
        lower.includes('insufficient available balance')
      );
    }
  }
  return false;
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = String((error as { message: unknown }).message).toLowerCase();
      return (
        message.includes('failed to fetch') ||
        message.includes('network request failed') ||
        message.includes('load failed')
      );
    }
    return false;
  }
  return (
    error.message === 'Network request failed' ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('Network Error') ||
    error.name === 'AbortError'
  );
}

export function toUserMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (isRequestEditLockedError(error)) return REQUEST_EDIT_LOCKED_MESSAGE;

  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code, message } = error as { code: unknown; message: unknown };
    if (typeof code === 'string' && typeof message === 'string') {
      if (code === 'PGRST202') {
        const lower = message.toLowerCase();
        if (lower.includes('wallet')) {
          return 'Wallet is unavailable until the latest database migrations are applied.';
        }
        if (lower.includes('bank_account')) {
          return 'Bank accounts are unavailable until the latest database migrations are applied.';
        }
        return 'This action is unavailable until the latest database migrations are applied.';
      }
      if (INTENTIONAL_ERROR_CODES.has(code)) {
        if (message.toLowerCase().includes('insufficient wallet balance')) {
          return 'You don\u2019t have enough available money in your wallet. Add money, then try accepting again.';
        }
        if (message.toLowerCase().includes('insufficient available balance')) {
          return 'You don\u2019t have enough available money for this action.';
        }
        return message;
      }
      if (code.startsWith('23')) return message;
    }
  }

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('edge function returned a non-2xx')) {
      return 'Could not complete this request. Try again in a moment.';
    }
    if (error.message.length > 0 && error.message.length < 240) {
      return error.message;
    }
  }

  return FALLBACK_MESSAGE;
}
