import type { Database } from '@/lib/supabase/database.types';
import type { RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];
type AssignmentStatus = Database['public']['Enums']['project_assignment_status'];

export type ProjectResponseListRow = RpcRow<Functions['list_project_responses']['Returns']>;

export type ProjectResponseFilter = 'all' | 'awaiting_review' | 'assigned' | 'completed';

export const PROJECT_RESPONSE_FILTER_OPTIONS: { value: ProjectResponseFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'completed', label: 'Completed' },
];

export function projectResponseListBucket(
  status: AssignmentStatus,
): ProjectResponseFilter | null {
  if (status === 'cancelled') return null;
  if (status === 'completed') return 'completed';
  if (status === 'accepted' || status === 'commenced') return 'assigned';
  if (status === 'offered' || status === 'terms_negotiation') return 'awaiting_review';
  return null;
}

export function projectResponsesForFilter(
  rows: ProjectResponseListRow[],
  filter: ProjectResponseFilter,
): ProjectResponseListRow[] {
  if (filter === 'all') {
    return rows.filter((row) => projectResponseListBucket(row.status) !== null);
  }
  return rows.filter((row) => projectResponseListBucket(row.status) === filter);
}

export function projectResponseCardStatus(filter: ProjectResponseFilter): {
  label: string;
  tone: 'warning' | 'active' | 'info' | 'brand';
} {
  switch (filter) {
    case 'awaiting_review':
      return { label: 'Awaiting review', tone: 'warning' };
    case 'assigned':
      return { label: 'Assigned', tone: 'active' };
    case 'completed':
      return { label: 'Completed', tone: 'active' };
    default:
      return { label: 'Response', tone: 'info' };
  }
}

export function projectResponseRowCardStatus(row: ProjectResponseListRow): {
  label: string;
  tone: 'warning' | 'active' | 'info' | 'brand' | 'neutral';
} {
  switch (row.status) {
    case 'completed':
      return { label: 'Completed', tone: 'active' };
    case 'commenced':
      return { label: 'In progress', tone: 'brand' };
    case 'accepted':
      return { label: 'Assigned', tone: 'info' };
    case 'offered':
    case 'terms_negotiation':
      return { label: 'Awaiting review', tone: 'warning' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    default: {
      const label = String(row.status).replaceAll('_', ' ');
      return { label, tone: 'neutral' };
    }
  }
}

export function projectResponseRowMayOpenAssignment(row: ProjectResponseListRow): boolean {
  return row.status === 'accepted' || row.status === 'commenced' || row.status === 'completed';
}

export function projectResponseFilterEmptyState(filter: ProjectResponseFilter): {
  title: string;
  message: string;
} {
  switch (filter) {
    case 'all':
      return {
        title: 'No responses yet',
        message: 'When workers respond or you assign someone, they appear here.',
      };
    case 'assigned':
      return {
        title: 'No active assignments',
        message: 'Accepted workers who have not finished appear here.',
      };
    case 'completed':
      return {
        title: 'No completed workers',
        message: 'Workers who finished and were paid out appear here.',
      };
    default:
      return {
        title: 'No responses yet',
        message: 'When workers respond to your project, their offers show up here for review.',
      };
  }
}

/** Worker-initiated offer waiting for creator accept/reject (not creator-assigned offers). */
export function projectResponseCreatorMayReview(row: ProjectResponseListRow): boolean {
  if (row.creator_may_review === true) return true;

  const proposedBy = row.terms_proposed_by;
  if (proposedBy != null && proposedBy !== '') {
    return (
      proposedBy === row.worker_id &&
      (row.status === 'offered' || row.status === 'terms_negotiation')
    );
  }

  if (row.creator_may_review === false) {
    return false;
  }

  return row.status === 'offered' || row.status === 'terms_negotiation';
}