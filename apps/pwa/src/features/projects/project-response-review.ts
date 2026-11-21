import type { Database } from '@/lib/supabase/database.types';

type ProjectStatus = Database['public']['Enums']['project_status'];
type ProjectFundingStatus = Database['public']['Enums']['project_funding_status'];

/** Mirrors requester accept eligibility while worker responses await creator review. */
export function projectCreatorCanReviewWorkerResponses(detail: {
  status: ProjectStatus;
  funding_status: ProjectFundingStatus;
}): boolean {
  if (detail.funding_status === 'unsuccessful') return false;
  if (detail.status === 'funding_unsuccessful') return false;
  return true;
}