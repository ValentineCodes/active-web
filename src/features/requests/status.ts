import { PAYMENT_STATUS_LABELS } from '@/features/domain/transitions';
import type { PaymentStatus } from '@/features/domain/model';
import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];
type ResponseStatus = Database['public']['Enums']['response_status'];
type AvailabilityStatus = Database['public']['Enums']['availability_status'];
type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning';

/**
 * The lifecycle has a "Responses" stage that is not a stored status: a request is still
 * searching, it just has offers waiting. That distinction is made here, so every list
 * says the same thing about the same row.
 */
export function requestStatusBadge(
  status: RequestStatus,
  pendingResponseCount: number,
): { label: string; tone: Tone } {
  switch (status) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'posted':
    case 'searching':
      return pendingResponseCount > 0
        ? {
            label: `${pendingResponseCount} ${pendingResponseCount === 1 ? 'response' : 'responses'}`,
            tone: 'brand',
          }
        : { label: 'Posted', tone: 'warning' };
    case 'accepted':
      return { label: 'Selected', tone: 'active' };
    case 'in_progress':
      return { label: 'In progress', tone: 'active' };
    case 'completion_pending':
      return { label: 'Awaiting confirmation', tone: 'warning' };
    case 'disputed':
      return { label: 'Disputed', tone: 'danger' };
    case 'no_show':
      return { label: 'No-show', tone: 'danger' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
  }
}

export function responseStatusBadge(status: ResponseStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'pending':
      return { label: 'Responded', tone: 'brand' };
    case 'accepted':
      return { label: 'Selected', tone: 'active' };
    case 'declined':
      return { label: 'Not chosen', tone: 'neutral' };
    case 'withdrawn':
      return { label: 'Withdrawn', tone: 'neutral' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
  }
}

/** Connected job screen and engagement cards — same words everywhere. */
export function requestEngagementStatusBadge(status: RequestStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'accepted':
      return { label: 'Selected', tone: 'active' };
    case 'in_progress':
      return { label: 'In progress', tone: 'active' };
    case 'completion_pending':
      return { label: 'Awaiting confirmation', tone: 'warning' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'disputed':
      return { label: 'Disputed', tone: 'danger' };
    case 'no_show':
      return { label: 'No-show', tone: 'danger' };
    default:
      return { label: 'Selected', tone: 'active' };
  }
}

/** Provider inbox: how your answer relates to the request lifecycle. */
export function providerResponseLifecycleBadge(
  responseStatus: ResponseStatus,
  requestStatus: RequestStatus,
): { label: string; tone: Tone } {
  if (responseStatus === 'accepted') {
    return requestEngagementStatusBadge(requestStatus);
  }

  if (
    (responseStatus === 'pending' && requestStatus === 'posted') ||
    (responseStatus === 'pending' && requestStatus === 'searching')
  ) {
    return { label: 'Responded', tone: 'brand' };
  }

  return responseStatusBadge(responseStatus);
}

export function availabilityStatusBadge(
  status: AvailabilityStatus,
): { label: string; tone: Tone } | null {
  if (status === 'available') {
    return { label: 'Available', tone: 'active' };
  }

  if (status === 'busy') {
    return { label: 'Committed', tone: 'active' };
  }

  return null;
}

/** Browse lists: you can still answer, or you already did. */
export function nearbyRequestBadge(alreadyResponded: boolean): { label: string; tone: Tone } {
  if (alreadyResponded) {
    return { label: 'Responded', tone: 'brand' };
  }

  return { label: 'Available', tone: 'warning' };
}

export function paymentStatusBadge(status: PaymentStatus): { label: string; tone: Tone } {
  const label = PAYMENT_STATUS_LABELS[status];

  switch (status) {
    case 'locked':
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
      return 'Held from your wallet while this request is open.';
    case 'pending':
      return 'Held until the job completes, is cancelled, or is refunded.';
    case 'disputed':
      return 'Locked while support reviews a report.';
    case 'released':
      return 'Paid to your provider after you confirmed completion.';
    case 'refunded':
      return 'Returned to your available wallet balance.';
    default:
      return null;
  }
}
