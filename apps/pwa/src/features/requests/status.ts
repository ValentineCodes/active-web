import { PAYMENT_STATUS_LABELS } from '@/features/domain/transitions';
import type { PaymentStatus } from '@/features/domain/model';
import {
  requestLifecycleBadge,
  resolveRequestLifecycleStage,
  type RequestLifecycleStage,
} from '@/features/domain/lifecycle';
import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];
type ResponseStatus = Database['public']['Enums']['response_status'];
type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function requestStatusBadge(
  status: RequestStatus,
  pendingResponseCount: number,
  options?: { expiresAt?: string | null; viewerIsRequester?: boolean },
): { label: string; tone: Tone; hint: string } {
  const stage = resolveRequestLifecycleStage({
    status,
    pendingResponseCount,
    expiresAt: options?.expiresAt,
  });
  const badge = requestLifecycleBadge(stage, {
    viewerIsRequester: options?.viewerIsRequester ?? true,
  });
  return badge;
}

export function responseStatusBadge(status: ResponseStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'pending':
      return { label: 'Responded', tone: 'brand' };
    case 'accepted':
      return { label: 'Chosen', tone: 'active' };
    case 'declined':
      return { label: 'Not chosen', tone: 'neutral' };
    case 'withdrawn':
      return { label: 'Withdrawn', tone: 'neutral' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
  }
}

export function requestEngagementStatusBadge(
  status: RequestStatus,
  options?: { viewerIsRequester?: boolean },
): { label: string; tone: Tone; hint: string } {
  const stage = resolveRequestLifecycleStage({ status, pendingResponseCount: 0 });
  return requestLifecycleBadge(stage, options);
}

export function myResponseLifecycleBadge(
  responseStatus: ResponseStatus,
  requestStatus: RequestStatus,
  options?: { viewerIsRequester?: boolean },
): { label: string; tone: Tone } {
  if (responseStatus === 'accepted') {
    const badge = requestEngagementStatusBadge(requestStatus, {
      viewerIsRequester: options?.viewerIsRequester ?? false,
    });
    return { label: badge.label, tone: badge.tone };
  }

  if (responseStatus === 'pending') {
    if (requestStatus === 'accepted' || requestStatus === 'in_progress') {
      return { label: 'Offer waiting', tone: 'info' };
    }
    if (requestStatus === 'posted' || requestStatus === 'searching') {
      return { label: 'Responded', tone: 'brand' };
    }
  }

  return responseStatusBadge(responseStatus);
}

export function responderAvailabilityBadge(available: boolean): { label: string; tone: Tone } {
  if (available) {
    return { label: 'Available for this time', tone: 'brand' };
  }

  return { label: 'Unavailable at this time', tone: 'warning' };
}

export function nearbyRequestBadge(alreadyResponded: boolean): { label: string; tone: Tone } {
  if (alreadyResponded) {
    return { label: 'Responded', tone: 'brand' };
  }

  return { label: 'Open', tone: 'warning' };
}

export function paymentStatusBadge(status: PaymentStatus): { label: string; tone: Tone } {
  const label = PAYMENT_STATUS_LABELS[status];

  switch (status) {
    case 'locked':
      return { label, tone: 'warning' };
    case 'pending':
      return { label, tone: 'warning' };
    case 'disputed':
      return { label, tone: 'danger' };
    case 'released':
    case 'refunded':
      return { label, tone: 'neutral' };
    default:
      return { label, tone: 'neutral' };
  }
}

export function paymentStatusHint(
  status: PaymentStatus,
  viewerIsRequester: boolean,
): string | null {
  if (!viewerIsRequester) {
    return null;
  }

  switch (status) {
    case 'locked':
      return 'Held from your wallet while acceptance is being confirmed.';
    case 'pending':
      return 'Held until the request is done, cancelled, or refunded.';
    case 'disputed':
      return 'On hold while we review a report.';
    case 'released':
      return 'Paid after you confirmed completion.';
    case 'refunded':
      return 'Returned to your available wallet balance.';
    default:
      return null;
  }
}

export type { RequestLifecycleStage };
