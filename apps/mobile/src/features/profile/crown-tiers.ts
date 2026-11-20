import type { ImageSourcePropType } from 'react-native';

export const CROWN_TIER_ORDER = ['none', 'bronze', 'silver', 'diamond', 'gold'] as const;
export type CrownTierId = (typeof CROWN_TIER_ORDER)[number];

/** Defaults match `reputation_config` crown thresholds in Supabase. */
export const CROWN_THRESHOLDS: Record<CrownTierId, number> = {
  none: 0,
  bronze: 3,
  silver: 10,
  diamond: 25,
  gold: 50,
};

export const CROWN_IMAGES: Record<Exclude<CrownTierId, 'none'>, ImageSourcePropType> = {
  bronze: require('../../../assets/images/crowns/bronze.png'),
  silver: require('../../../assets/images/crowns/silver.png'),
  diamond: require('../../../assets/images/crowns/diamond.png'),
  gold: require('../../../assets/images/crowns/gold.png'),
};

export function normalizeCrownTier(tier: string | null | undefined): CrownTierId {
  const normalized = tier?.trim().toLowerCase() ?? 'none';
  if (normalized === 'hidden' || normalized === '') return 'none';
  if ((CROWN_TIER_ORDER as readonly string[]).includes(normalized)) {
    return normalized as CrownTierId;
  }
  return 'none';
}

export function crownTierLabel(tier: string | null | undefined): string | null {
  const id = normalizeCrownTier(tier);
  if (id === 'none') return 'Starting';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const CROWN_LADDER: Exclude<CrownTierId, 'none'>[] = ['bronze', 'silver', 'diamond', 'gold'];

export function crownTierImage(tier: string | null | undefined): ImageSourcePropType | null {
  const id = normalizeCrownTier(tier);
  if (id === 'none') return null;
  return CROWN_IMAGES[id];
}

export function isMaxCrownTier(tier: string | null | undefined): boolean {
  return normalizeCrownTier(tier) === 'gold';
}

/** Tier shown on the progress bar (next goal, or gold when maxed). */
export function crownGoalTier(
  tier: string | null | undefined,
  nextTier: string | null | undefined,
): Exclude<CrownTierId, 'none'> {
  const next = normalizeCrownTier(nextTier);
  if (next !== 'none') return next;
  const current = normalizeCrownTier(tier);
  if (current === 'none') return 'bronze';
  const index = CROWN_LADDER.indexOf(current);
  if (index >= 0 && index < CROWN_LADDER.length - 1) return CROWN_LADDER[index + 1];
  return 'gold';
}

export function crownProgressFraction(
  points: number,
  tier: string | null | undefined,
  nextTier: string | null | undefined,
): number {
  const atMax = isMaxCrownTier(tier);
  if (atMax) return 1;
  const goal = crownGoalTier(tier, nextTier);
  const floor = CROWN_THRESHOLDS[normalizeCrownTier(tier)];
  const ceil = CROWN_THRESHOLDS[goal];
  if (ceil <= floor) return 1;
  return Math.min(1, Math.max(0, (points - floor) / (ceil - floor)));
}