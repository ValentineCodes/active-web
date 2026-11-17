import type { Database } from '@/lib/supabase/database.types';

type MilestoneStatus = Database['public']['Enums']['milestone_status'];

/** Visual step state — matches paidaid milestone-plan dot variants. */
export type MilestoneDotVariant = 'locked' | 'active' | 'pending' | 'approved';

export function engagementMilestoneDotVariant(status: MilestoneStatus): MilestoneDotVariant {
  if (status === 'approved_paid') return 'approved';
  if (status === 'in_progress') return 'active';
  if (status === 'submitted' || status === 'revision_requested') return 'pending';
  return 'locked';
}