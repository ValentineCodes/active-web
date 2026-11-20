import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  CROWN_IMAGE_SRC,
  crownGoalTier,
  crownProgressFraction,
  crownTierImageSrc,
  crownTierLabel,
  isMaxCrownTier,
} from '@/features/profile/crown-tiers';

type CrownSummaryProps = {
  tier: string | null | undefined;
  points: number | null | undefined;
  shield: number | null | undefined;
  nextTier?: string | null;
  pointsToNext?: number | null;
  loading?: boolean;
  variant?: 'progress' | 'compact';
};

const CROWN_PX = 36;
const PROGRESS_BAR_WIDTH_PX = 168;

export function CrownSummary({
  tier,
  points,
  shield,
  nextTier,
  pointsToNext,
  loading,
  variant = 'progress',
}: CrownSummaryProps) {
  if (loading) {
    return <SkeletonBlock className="h-14 w-full max-w-xs rounded-xl" />;
  }

  const label = crownTierLabel(tier);
  if (!label) return null;

  const pointTotal = typeof points === 'number' ? points : 0;
  const atMax = isMaxCrownTier(tier);
  const goalTier = atMax ? 'gold' : crownGoalTier(tier, nextTier ?? null);
  const crownSrc = CROWN_IMAGE_SRC[goalTier];

  if (variant === 'compact') {
    const currentSrc = crownTierImageSrc(tier);
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {currentSrc ? <img src={currentSrc} alt="" className="h-6 w-6 object-contain" /> : null}
        <span className="text-sm font-semibold text-ink">Crown · {label}</span>
        <span className="text-sm text-muted">{pointTotal} pts</span>
      </div>
    );
  }

  const progress = crownProgressFraction(pointTotal, tier, nextTier ?? null);
  const nextLabel = atMax ? null : crownTierLabel(goalTier);
  const pointsLine =
    typeof pointsToNext === 'number' && nextLabel && !atMax
      ? `${pointTotal} pts · ${pointsToNext} to ${nextLabel}`
      : `${pointTotal} pts`;

  return (
    <div className="flex w-full flex-col items-center">
      <div>
        <div className="flex flex-row items-center gap-2">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface"
            style={{ width: PROGRESS_BAR_WIDTH_PX }}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <img
            src={crownSrc}
            alt={nextLabel ? `Next crown: ${nextLabel}` : 'Gold crown'}
            className="shrink-0 object-contain"
            style={{ width: CROWN_PX, height: CROWN_PX }}
          />
        </div>
        <div
          className="-mt-3 flex flex-row flex-wrap items-baseline gap-x-2"
          style={{ width: PROGRESS_BAR_WIDTH_PX }}
        >
          <span className="text-xs text-muted">{pointsLine}</span>
          {typeof shield === 'number' && shield > 0 ? (
            <span className="text-xs text-muted">Shield {shield}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}