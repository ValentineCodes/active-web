import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];

export function isAwaitingReviewRequestView(
  status: RequestStatus,
  expiresAt: string | null,
): boolean {
  if (status === 'awaiting_review') {
    return true;
  }

  return status === 'posted' && expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
}

export function canReuseRequest(status: RequestStatus, _expiresAt: string | null): boolean {
  return status === 'completed' || status === 'expired';
}

export function reuseRequestButtonLabel(status: RequestStatus): string | null {
  if (status === 'expired') {
    return 'Resend request';
  }

  if (status === 'completed') {
    return 'Request again';
  }

  return null;
}

export function isExpiredRequestView(status: RequestStatus, _expiresAt: string | null): boolean {
  if (status === 'expired') {
    return true;
  }

  return false;
}

/** Searching rows past expiry use the same action as expired. */
export function reuseRequestButtonLabelForRequest(
  status: RequestStatus,
  expiresAt: string | null,
): string | null {
  if (isExpiredRequestView(status, expiresAt)) {
    return 'Resend request';
  }

  return reuseRequestButtonLabel(status);
}
