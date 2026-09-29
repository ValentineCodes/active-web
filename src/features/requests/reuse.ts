import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];

export function canReuseRequest(status: RequestStatus, expiresAt: string | null): boolean {
  if (status === 'completed' || status === 'expired') {
    return true;
  }

  if (status === 'posted' && expiresAt !== null && new Date(expiresAt).getTime() <= Date.now()) {
    return true;
  }

  return false;
}

export function reuseRequestButtonLabel(status: RequestStatus): string | null {
  if (status === 'expired') {
    return 'Resend Request';
  }

  if (status === 'completed') {
    return 'Request Again';
  }

  return null;
}

/** Searching rows past expiry use the same action as expired. */
export function isExpiredRequestView(status: RequestStatus, expiresAt: string | null): boolean {
  if (status === 'expired') {
    return true;
  }

  return status === 'posted' && canReuseRequest(status, expiresAt);
}

/** Searching rows past expiry use the same action as expired. */
export function reuseRequestButtonLabelForRequest(
  status: RequestStatus,
  expiresAt: string | null,
): string | null {
  if (isExpiredRequestView(status, expiresAt)) {
    return 'Resend Request';
  }

  return reuseRequestButtonLabel(status);
}
