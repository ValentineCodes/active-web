import type { Database } from '@/lib/supabase/database.types';

type ProjectFundingStatus = Database['public']['Enums']['project_funding_status'];

type ProjectContributeEligibility = {
  viewer_is_creator: boolean;
  viewer_may_contribute?: boolean | null;
  funding_status: ProjectFundingStatus;
  funding_visibility: Database['public']['Enums']['project_funding_visibility'];
};

const OPEN_FUNDING: ProjectFundingStatus[] = ['open', 'target_met'];

/** Matches server rules for showing the contribute CTA (see get_project.viewer_may_contribute). */
export function projectViewerMayContribute(detail: ProjectContributeEligibility): boolean {
  if (!OPEN_FUNDING.includes(detail.funding_status)) return false;
  if (detail.viewer_may_contribute != null) return detail.viewer_may_contribute;
  if (detail.funding_visibility === 'public') return true;
  if (detail.viewer_is_creator) return true;
  return false;
}