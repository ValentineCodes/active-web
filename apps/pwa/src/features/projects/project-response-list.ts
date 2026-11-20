import type { Database } from '@/lib/supabase/database.types';
import type { RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];
type AssignmentStatus = Database['public']['Enums']['project_assignment_status'];

export type ProjectResponseListRow = RpcRow<Functions['list_project_responses']['Returns']>;

export type ProjectResponseFilter = 'awaiting_review' | 'assigned';

export const PROJECT_RESPONSE_FILTER_OPTIONS: { value: ProjectResponseFilter; label: string }[] = [
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'assigned', label: 'Assigned' },
];

export function projectResponseListBucket(
  status: AssignmentStatus,
): ProjectResponseFilter | null {
  if (status === 'cancelled') return null;
  if (status === 'accepted' || status === 'commenced' || status === 'completed') {
    return 'assigned';
  }
  if (status === 'offered' || status === 'terms_negotiation') {
    return 'awaiting_review';
  }
  return null;
}

export function projectResponsesForFilter(
  rows: ProjectResponseListRow[],
  filter: ProjectResponseFilter,
): ProjectResponseListRow[] {
  return rows.filter((row) => projectResponseListBucket(row.status) === filter);
}

export function projectResponseCardStatus(filter: ProjectResponseFilter): {
  label: string;
  tone: 'warning' | 'active';
} {
  return filter === 'awaiting_review'
    ? { label: 'Awaiting review', tone: 'warning' }
    : { label: 'Assigned', tone: 'active' };
}