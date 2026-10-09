import {
  isRequestEditLockedError,
  REQUEST_EDIT_LOCKED_MESSAGE,
} from '@/features/requests/request-edit-locked';

/**
 * The database raises deliberate, user-readable messages for the states a person can
 * actually hit ("this request is no longer available to you", schedule conflict at selection).
 * Those are shown as-is. Anything else is either a transport
 * failure or a bug, and gets a generic message instead of leaking internals.
 */

/** Postgres error classes the functions in `supabase/migrations` raise on purpose. */
const INTENTIONAL_ERROR_CODES = new Set([
  '42501', // insufficient privilege - auth or onboarding guard
  '22023', // invalid parameter value - failed validation
  '55000', // object not in prerequisite state - wrong lifecycle state
  'P0002', // no data found
  '23505', // unique violation - e.g. responding twice
  '23514', // check violation
]);

const NETWORK_MESSAGE = 'You appear to be offline. Check your connection and try again.';
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
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
        return 'Wallet is unavailable until the latest database migrations are applied.';
      }
      if (code === '25006') {
        return 'Something could not load. Restart the app and run the latest database migrations.';
      }
      if (
        code === 'PGRST301' ||
        message.toLowerCase().includes('invalid authentication credentials')
      ) {
        return 'Session expired or Supabase keys are wrong. Sign out, check EXPO_PUBLIC_SUPABASE_ANON_KEY (eyJ…), and sign in again.';
      }
      if (INTENTIONAL_ERROR_CODES.has(code)) {
        if (message.toLowerCase().includes('insufficient wallet balance')) {
          return 'You don\u2019t have enough available money to fund this request.';
        }
        if (message.toLowerCase().includes('insufficient available balance')) {
          return 'You don\u2019t have enough available money for this action.';
        }
        return message;
      }
      if (code.startsWith('23')) return message;
    }
  }

  // Supabase Auth surfaces its own already-readable messages for bad or expired codes.
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const { status, message } = error as { status: unknown; message: unknown };
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      typeof message === 'string'
    ) {
      return message;
    }
  }

  // Picker and file checks throw ordinary Errors whose text is already meant for the user.
  if (error instanceof Error && error.message.length > 0 && error.message.length < 240) {
    return error.message;
  }

  return FALLBACK_MESSAGE;
}
