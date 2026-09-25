import type { Database } from '@/lib/supabase/database.types';
import { formatAgo, formatWhen } from '@/lib/format';

import { isExpiredRequestView } from '@/features/requests/reuse';

type RequestStatus = Database['public']['Enums']['request_status'];

/** User-facing lifecycle slice for lists and filters (not identical to stored status). */
export type RequestHistoryBucket =
  | 'searching'
  | 'responses'
  | 'handshake'
  | 'in_progress'
  | 'completion_pending'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'disputed'
  | 'draft'
  | 'no_show';

export type ActiveRequestFilter =
  | 'all'
  | 'searching'
  | 'responses'
  | 'handshake'
  | 'in_progress'
  | 'completion_pending'
  | 'disputed';

export type PastRequestFilter = 'all' | 'completed' | 'cancelled' | 'expired';

export const ACTIVE_REQUEST_FILTERS: { key: ActiveRequestFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'searching', label: 'Searching' },
  { key: 'responses', label: 'Responses' },
  { key: 'handshake', label: 'Selected' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completion_pending', label: 'Completion pending' },
  { key: 'disputed', label: 'Disputed' },
];

export const PAST_REQUEST_FILTERS: { key: PastRequestFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'expired', label: 'Expired' },
];

export const PAST_SECTION_LABELS: Record<
  Extract<RequestHistoryBucket, 'completed' | 'cancelled' | 'expired' | 'no_show'>,
  string
> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  no_show: 'No-show',
};

const PAST_SECTION_ORDER: (keyof typeof PAST_SECTION_LABELS)[] = [
  'completed',
  'cancelled',
  'expired',
  'no_show',
];

type RequestRow = {
  status: RequestStatus;
  expires_at: string | null;
  pending_response_count: number;
  scheduled_for: string | null;
  location_label: string;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

export function requestHistoryBucket(request: {
  status: RequestStatus;
  expires_at: string | null;
  pending_response_count: number;
}): RequestHistoryBucket {
  if (isExpiredRequestView(request.status, request.expires_at)) {
    return 'expired';
  }

  switch (request.status) {
    case 'draft':
      return 'draft';
    case 'searching':
      return request.pending_response_count > 0 ? 'responses' : 'searching';
    case 'accepted':
      return 'handshake';
    case 'in_progress':
      return 'in_progress';
    case 'completion_pending':
      return 'completion_pending';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'disputed':
      return 'disputed';
    case 'no_show':
      return 'no_show';
  }
}

/** Open work — expired searching rows belong in history instead. */
export function isActiveRequest(request: {
  status: RequestStatus;
  expires_at: string | null;
}): boolean {
  if (isExpiredRequestView(request.status, request.expires_at)) {
    return false;
  }

  return [
    'draft',
    'searching',
    'accepted',
    'in_progress',
    'completion_pending',
    'disputed',
  ].includes(request.status);
}

export function matchesActiveFilter(
  filter: ActiveRequestFilter,
  bucket: RequestHistoryBucket,
): boolean {
  if (filter === 'all') {
    return true;
  }

  return bucket === filter;
}

export function matchesPastFilter(
  filter: PastRequestFilter,
  bucket: RequestHistoryBucket,
): boolean {
  if (filter === 'all') {
    return (
      bucket === 'completed' ||
      bucket === 'cancelled' ||
      bucket === 'expired' ||
      bucket === 'no_show'
    );
  }

  return bucket === filter;
}

export function requestHistoryMeta(request: RequestRow): string[] {
  const bucket = requestHistoryBucket(request);
  let milestone: string | null = null;

  if (bucket === 'completed' && request.completed_at) {
    milestone = `Completed ${formatAgo(request.completed_at)}`;
  } else if (bucket === 'cancelled' && request.cancelled_at) {
    milestone = `Cancelled ${formatAgo(request.cancelled_at)}`;
  } else if (bucket === 'expired' && request.expires_at) {
    milestone = `Expired ${formatAgo(request.expires_at)}`;
  } else if (bucket === 'no_show') {
    milestone = 'Marked no-show';
  } else if (bucket === 'draft') {
    milestone = `Started ${formatAgo(request.created_at)}`;
  } else {
    milestone = `Posted ${formatAgo(request.created_at)}`;
  }

  return [milestone, formatWhen(request.scheduled_for), request.location_label];
}

export function groupPastRequests<T extends RequestRow & { request_id: string }>(
  requests: T[],
): { title: string; data: T[] }[] {
  const byBucket = new Map<keyof typeof PAST_SECTION_LABELS, T[]>();

  for (const request of requests) {
    const bucket = requestHistoryBucket(request);
    if (
      bucket !== 'completed' &&
      bucket !== 'cancelled' &&
      bucket !== 'expired' &&
      bucket !== 'no_show'
    ) {
      continue;
    }

    const list = byBucket.get(bucket) ?? [];
    list.push(request);
    byBucket.set(bucket, list);
  }

  return PAST_SECTION_ORDER.flatMap((bucket) => {
    const data = byBucket.get(bucket);
    if (!data?.length) {
      return [];
    }

    return [{ title: PAST_SECTION_LABELS[bucket], data }];
  });
}
