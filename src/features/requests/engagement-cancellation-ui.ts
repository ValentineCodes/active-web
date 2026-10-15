import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];
type CancellationStatus = Database['public']['Enums']['engagement_cancellation_request_status'];

const ELIGIBLE_ENGAGEMENT_STATUSES: RequestStatus[] = ['accepted', 'in_progress'];

export function isEngagementCancellationEligibleStatus(
  status: RequestStatus | string | null | undefined,
): boolean {
  return status != null && ELIGIBLE_ENGAGEMENT_STATUSES.includes(status as RequestStatus);
}

export function isEngagementCancellationPending(
  status: CancellationStatus | string | null | undefined,
): boolean {
  return status === 'pending';
}

export function canShowEngagementCancelAction(input: {
  requestStatus: RequestStatus | string;
  viewerIsRequester: boolean;
  pendingCancellation: boolean;
}): boolean {
  if (!isEngagementCancellationEligibleStatus(input.requestStatus)) {
    return false;
  }

  if (input.viewerIsRequester && input.pendingCancellation) {
    return false;
  }

  return true;
}

export function engagementCancellationPollIntervalMs(
  respondBy: string | null | undefined,
  status: CancellationStatus | string | null | undefined,
): number | false {
  if (!isEngagementCancellationPending(status) || !respondBy) {
    return false;
  }

  const remainingMs = new Date(respondBy).getTime() - Date.now();
  if (remainingMs <= 0) {
    return 5_000;
  }

  return Math.min(60_000, Math.max(15_000, remainingMs));
}
