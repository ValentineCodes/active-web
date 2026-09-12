import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];
type ResponseStatus = Database['public']['Enums']['response_status'];
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
    case 'searching':
      return pendingResponseCount > 0
        ? {
            label: `${pendingResponseCount} ${pendingResponseCount === 1 ? 'response' : 'responses'}`,
            tone: 'brand',
          }
        : { label: 'Searching', tone: 'warning' };
    case 'accepted':
      return { label: 'Accepted', tone: 'active' };
    case 'in_progress':
      return { label: 'In progress', tone: 'active' };
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
      return { label: 'Waiting', tone: 'warning' };
    case 'accepted':
      return { label: 'Accepted', tone: 'active' };
    case 'declined':
      return { label: 'Not chosen', tone: 'neutral' };
    case 'withdrawn':
      return { label: 'Withdrawn', tone: 'neutral' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
  }
}
