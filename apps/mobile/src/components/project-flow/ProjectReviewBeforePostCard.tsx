import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { TagPill } from '@/components/request-flow/TagPill';
import { MARKET } from '@/config';
import { formatMoney } from '@/lib/format';
import { useColors } from '@/theme';

type ProjectReviewBeforePostCardProps = {
  title: string;
  description: string;
  budgetMajor: number;
  minTargetMajor: number;
  minContributionMajor: number;
  deadlineLabel: string;
  visibilityLabel: string;
  locationLabel: string;
  tagNames: string[];
  previewUri?: string | null;
  onRemovePhoto?: () => void;
  removePhotoDisabled?: boolean;
};

export function ProjectReviewBeforePostCard({
  title,
  description,
  budgetMajor,
  minTargetMajor,
  minContributionMajor,
  deadlineLabel,
  visibilityLabel,
  locationLabel,
  tagNames,
  previewUri,
  onRemovePhoto,
  removePhotoDisabled,
}: ProjectReviewBeforePostCardProps) {
  const colors = useColors();

  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-elevated p-4">
      <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Review before creating
      </Text>
      {previewUri ? (
        <View className="relative w-full overflow-hidden rounded-xl bg-surface" style={{ aspectRatio: 4 / 3 }}>
          <Image
            source={{ uri: previewUri }}
            accessibilityLabel="Selected project photo"
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
          />
          {onRemovePhoto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              disabled={removePhotoDisabled}
              onPress={onRemovePhoto}
              className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-full bg-canvas/90 active:opacity-90"
            >
              <Ionicons name="close-circle" size={28} color={colors.ink} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text className="text-xl font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>
      {description ? (
        <Text className="text-sm leading-5 text-muted" numberOfLines={3}>
          {description}
        </Text>
      ) : null}
      <View className="gap-1">
        <Text className="text-sm text-muted">
          Budget{' '}
          <Text className="font-semibold text-ink">
            {formatMoney(budgetMajor, MARKET.currency)}
          </Text>
        </Text>
        <Text className="text-sm text-muted">
          Min. target {formatMoney(minTargetMajor, MARKET.currency)} · Min. contribution{' '}
          {formatMoney(minContributionMajor, MARKET.currency)}
        </Text>
        <Text className="text-sm text-muted">
          {deadlineLabel} · {visibilityLabel} · {locationLabel}
        </Text>
      </View>
      {tagNames.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tagNames.map((name) => (
            <TagPill key={name} label={name} selected />
          ))}
        </View>
      ) : null}
    </View>
  );
}