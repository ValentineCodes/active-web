import type { Database } from '@/lib/supabase/database.types';

type ProjectFundingStatus = Database['public']['Enums']['project_funding_status'];

type ProjectContributeEligibility = {
  viewer_is_creator: boolean;
  viewer_may_contribute?: boolean | null;
  funding_status: ProjectFundingStatus;
  funding_visibility: Database['public']['Enums']['project_funding_visibility'];
};

const OPEN_FUNDING: ProjectFundingStatus[] = ['open', 'target_met'];

/** Remaining pool capacity in whole naira (matches server budget − contributed check). */
export function projectContributionRemainingMajor(
  budgetTotalKobo: number,
  contributedTotalKobo: number,
): number {
  const remainingKobo = budgetTotalKobo - contributedTotalKobo;
  return remainingKobo > 0 ? remainingKobo / 100 : 0;
}

const CONTRIBUTION_PRESET_CANDIDATES = [
  500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
] as const;

const MAX_CONTRIBUTION_PRESET_PILLS = 6;

/** Quick-pick amounts for the contribute modal; always includes min and max when valid. */
export function projectContributionAmountPresets(minMajor: number, maxMajor: number): number[] {
  const min = Math.trunc(minMajor);
  const max = Math.trunc(maxMajor);
  if (max <= 0) return [];

  const floor = Math.min(min, max);
  const ceiling = Math.max(min, max);

  const amounts = new Set<number>([floor, ceiling]);
  for (const candidate of CONTRIBUTION_PRESET_CANDIDATES) {
    if (candidate >= floor && candidate <= ceiling) {
      amounts.add(candidate);
    }
  }

  let sorted = [...amounts].sort((a, b) => a - b);
  if (sorted.length <= MAX_CONTRIBUTION_PRESET_PILLS) {
    return sorted;
  }

  const inner = sorted.slice(1, -1);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const picked = new Set<number>([first, last]);
  const slots = MAX_CONTRIBUTION_PRESET_PILLS - 2;
  for (let i = 0; i < slots; i++) {
    const idx = Math.round(((i + 1) / (slots + 1)) * (inner.length - 1));
    const amount = inner[idx]!;
    picked.add(amount);
  }
  return [...picked].sort((a, b) => a - b);
}

/** Matches server rules for showing the contribute CTA (see get_project.viewer_may_contribute). */
export function projectViewerMayContribute(detail: ProjectContributeEligibility): boolean {
  if (!OPEN_FUNDING.includes(detail.funding_status)) return false;
  if (detail.viewer_may_contribute != null) return detail.viewer_may_contribute;
  if (detail.funding_visibility === 'public') return true;
  if (detail.viewer_is_creator) return true;
  return false;
}

/** Guest browse detail sets `viewer_may_contribute` false — use funding visibility for the CTA. */
export function guestMaySeeProjectContributeCta(detail: ProjectContributeEligibility): boolean {
  if (!OPEN_FUNDING.includes(detail.funding_status)) return false;
  return detail.funding_visibility === 'public' && !detail.viewer_is_creator;
}
