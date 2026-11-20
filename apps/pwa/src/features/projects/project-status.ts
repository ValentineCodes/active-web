import type { Database } from '@/lib/supabase/database.types';

type ProjectStatus = Database['public']['Enums']['project_status'];
type ProjectFundingStatus = Database['public']['Enums']['project_funding_status'];

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

function fundingStatusLabel(status: ProjectFundingStatus): string {
  return status.replaceAll('_', ' ');
}

export function projectDetailBadge(input: {
  status: ProjectStatus;
  funding_status: ProjectFundingStatus;
}): { label: string; tone: BadgeTone } {
  if (input.status === 'draft') {
    return { label: 'Draft', tone: 'neutral' };
  }
  if (input.funding_status === 'open') {
    return { label: 'Funding open', tone: 'active' };
  }
  if (input.funding_status === 'target_met' || input.funding_status === 'fully_funded') {
    return { label: fundingStatusLabel(input.funding_status), tone: 'brand' };
  }
  if (input.funding_status === 'unsuccessful') {
    return { label: 'Funding ended', tone: 'warning' };
  }
  if (input.funding_status === 'not_open') {
    return { label: 'Not funded yet', tone: 'info' };
  }
  return { label: fundingStatusLabel(input.funding_status), tone: 'neutral' };
}

export function homeFeedProjectBadge(input: {
  viewer_is_creator: boolean;
  funding_status: ProjectFundingStatus;
}): string {
  if (input.viewer_is_creator) return 'Your project';
  if (input.funding_status === 'open') return 'Open project';
  return 'Project';
}