import { resolveRequestLifecycleStage } from '@/features/domain/lifecycle';
import type { Database } from '@/lib/supabase/database.types';

import { myResponseActivityBadge } from '@/features/requests/activity-list';

type RequestStatus = Database['public']['Enums']['request_status'];
type ResponseStatus = Database['public']['Enums']['response_status'];

export type MyRequestActivityFilter =
  'all' | 'open' | 'active' | 'in_progress' | 'completed' | 'disputed' | 'closed';

export type MyResponseActivityFilter = 'all' | 'waiting' | 'active' | 'completed' | 'closed';

export const MY_REQUEST_ACTIVITY_FILTER_OPTIONS: {
  value: MyRequestActivityFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'closed', label: 'Closed' },
];

export const MY_RESPONSE_ACTIVITY_FILTER_OPTIONS: {
  value: MyResponseActivityFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
];

export function myRequestMatchesActivityFilter(
  request: {
    status: RequestStatus;
    pending_response_count: number;
    expires_at: string | null;
  },
  filter: MyRequestActivityFilter,
): boolean {
  if (filter === 'all') return true;

  const stage = resolveRequestLifecycleStage({
    status: request.status,
    pendingResponseCount: request.pending_response_count,
    expiresAt: request.expires_at,
  });

  switch (filter) {
    case 'open':
      return stage === 'posted' || stage === 'responses';
    case 'active':
      return stage === 'selected';
    case 'in_progress':
      return stage === 'in_progress' || stage === 'completion_pending';
    case 'completed':
      return stage === 'completed';
    case 'disputed':
      return stage === 'disputed' || stage === 'no_show';
    case 'closed':
      return stage === 'cancelled' || stage === 'expired';
    default:
      return true;
  }
}

export function myResponseMatchesActivityFilter(
  response: {
    response_status: ResponseStatus;
    request_status: RequestStatus;
  },
  filter: MyResponseActivityFilter,
): boolean {
  if (filter === 'all') return true;

  const { label } = myResponseActivityBadge({
    response_status: response.response_status,
    request_status: response.request_status,
  });

  switch (filter) {
    case 'waiting':
      return label === 'Waiting';
    case 'active':
      return label === 'Active';
    case 'completed':
      return label === 'Completed';
    case 'closed':
      return label === 'Closed' || label === 'Not chosen' || label === 'Withdrawn';
    default:
      return true;
  }
}
