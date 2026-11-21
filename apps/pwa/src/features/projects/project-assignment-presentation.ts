import type { Database } from '@/lib/supabase/database.types';

type AssignmentStatus = Database['public']['Enums']['project_assignment_status'];

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  offered: 'Offered',
  terms_negotiation: 'Negotiating terms',
  accepted: 'Accepted',
  commenced: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function projectAssignmentStatusBadge(status: AssignmentStatus): {
  label: string;
  tone: BadgeTone;
} {
  const label = STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
  if (status === 'completed') return { label, tone: 'active' };
  if (status === 'commenced') return { label, tone: 'brand' };
  if (status === 'cancelled') return { label, tone: 'danger' };
  if (status === 'accepted') return { label, tone: 'info' };
  return { label, tone: 'neutral' };
}