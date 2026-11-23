import type { Database } from '@/lib/supabase/database.types';

type ProjectStatus = Database['public']['Enums']['project_status'];
type ProjectFundingStatus = Database['public']['Enums']['project_funding_status'];

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

function fundingStatusLabel(status: ProjectFundingStatus): string {
  return status.replaceAll('_', ' ');
}

const PROJECT_STATUS_META: Record<ProjectStatus, string> = {
  live: 'Collecting contributions',
  draft: 'Draft — not published',
  cancelled: 'Cancelled',
  funding_unsuccessful: 'Funding did not complete',
};

export function projectFundingProgressPct(contributedKobo: number, budgetKobo: number): number {
  if (budgetKobo <= 0) return 0;
  return Math.min(100, Math.round((contributedKobo / budgetKobo) * 100));
}

/** Fully funded projects surface budget and status only — not raised amount or progress. */
export function projectShowsFundingRaised(fundingStatus: ProjectFundingStatus): boolean {
  return fundingStatus !== 'fully_funded';
}

export function myCreatedProjectActivityMetaLine(status: ProjectStatus): string {
  return PROJECT_STATUS_META[status] ?? status.replaceAll('_', ' ');
}

export function myCreatedProjectContributorCountLine(contributorCount: number | undefined): string {
  const count = contributorCount ?? 0;
  if (count <= 0) return 'No contributors yet';
  if (count === 1) return '1 contributor';
  return `${count} contributors`;
}

export function projectDetailBadge(input: {
  status: ProjectStatus;
  funding_status: ProjectFundingStatus;
}): { label: string; tone: BadgeTone } {
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