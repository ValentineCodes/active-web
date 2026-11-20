import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  CROWN_IMAGES,
  crownGoalTier,
  crownProgressFraction,
  crownTierImage,
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

const CROWN_SIZE = 36;
const PROGRESS_BAR_WIDTH = 168;

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
    return <SkeletonBlock className="h-14 w-full rounded-xl" />;
  }

  const label = crownTierLabel(tier);
  if (!label) return null;

  const pointTotal = typeof points === 'number' ? points : 0;
  const atMax = isMaxCrownTier(tier);
  const goalTier = atMax ? 'gold' : crownGoalTier(tier, nextTier ?? null);
  const crownImage = atMax ? CROWN_IMAGES.gold : CROWN_IMAGES[goalTier];

  if (variant === 'compact') {
    const currentImage = crownTierImage(tier);
    return (
      <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {currentImage ? (
          <Image source={currentImage} style={{ width: 24, height: 24 }} contentFit="contain" />
        ) : null}
        <Text className="text-sm font-semibold text-ink">Crown · {label}</Text>
        <Text className="text-sm text-muted">{pointTotal} pts</Text>
      </View>
    );
  }

  const progress = crownProgressFraction(pointTotal, tier, nextTier ?? null);
  const nextLabel = atMax ? null : crownTierLabel(goalTier);

  const pointsLine =
    typeof pointsToNext === 'number' && nextLabel && !atMax
      ? `${pointTotal} pts · ${pointsToNext} to ${nextLabel}`
      : `${pointTotal} pts`;

  return (
    <View className="w-full items-center">
      <View>
        <View className="flex-row items-center gap-2">
          <View
            className="h-1.5 overflow-hidden rounded-full bg-surface"
            style={{ width: PROGRESS_BAR_WIDTH }}
          >
            <View className="h-full rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>
          <Image
            source={crownImage}
            style={{ width: CROWN_SIZE, height: CROWN_SIZE }}
            contentFit="contain"
            accessibilityLabel={nextLabel ? `Next crown: ${nextLabel}` : 'Gold crown'}
          />
        </View>
        <View
          className="-mt-3 flex-row flex-wrap items-baseline gap-x-2"
          style={{ width: PROGRESS_BAR_WIDTH }}
        >
          <Text className="text-xs text-muted">{pointsLine}</Text>
          {typeof shield === 'number' && shield > 0 ? (
            <Text className="text-xs text-muted">Shield {shield}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}