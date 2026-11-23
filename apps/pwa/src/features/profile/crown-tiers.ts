export const CROWN_TIER_ORDER = ['none', 'bronze', 'silver', 'diamond', 'gold'] as const;
export type CrownTierId = (typeof CROWN_TIER_ORDER)[number];

export const CROWN_THRESHOLDS: Record<CrownTierId, number> = {
  none: 0,
  bronze: 3,
  silver: 10,
  diamond: 25,
  gold: 50,
};

export const CROWN_IMAGE_SRC: Record<Exclude<CrownTierId, 'none'>, string> = {
  bronze: '/assets/crowns/bronze.png',
  silver: '/assets/crowns/silver.png',
  diamond: '/assets/crowns/diamond.png',
  gold: '/assets/crowns/gold.png',
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

export function crownTierImageSrc(tier: string | null | undefined): string | null {
  const id = normalizeCrownTier(tier);
  if (id === 'none') return null;
  return CROWN_IMAGE_SRC[id];
}

export function isMaxCrownTier(tier: string | null | undefined): boolean {
  return normalizeCrownTier(tier) === 'gold';
}

export function crownGoalTier(
  tier: string | null | undefined,
  nextTier: string | null | undefined,
): Exclude<CrownTierId, 'none'> {
  const next = normalizeCrownTier(nextTier);
  if (next !== 'none') return next;
  const current = normalizeCrownTier(tier);
  if (current === 'none') return 'bronze';
  const index = CROWN_LADDER.indexOf(current);
  if (index >= 0 && index < CROWN_LADDER.length - 1) return CROWN_LADDER[index + 1] ?? 'gold';
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
