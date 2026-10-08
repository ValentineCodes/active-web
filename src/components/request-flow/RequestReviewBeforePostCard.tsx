import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';

type RequestReviewBeforePostCardProps = {
  title: string;
  description: string;
  amountLabel: string | null;
  whenLabel: string;
  locationLabel: string;
  tagSlugs: string[];
  previewUri?: string | null;
};

export function RequestReviewBeforePostCard({
  title,
  description,
  amountLabel,
  whenLabel,
  locationLabel,
  tagSlugs,
  previewUri,
}: RequestReviewBeforePostCardProps) {
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-elevated p-4">
      <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Review before posting
      </Text>
      {previewUri ? (
        <Image
          source={{ uri: previewUri }}
          accessibilityLabel="Selected request photo"
          contentFit="cover"
          className="w-full overflow-hidden rounded-xl bg-surface"
          style={{ aspectRatio: 4 / 3 }}
        />
      ) : null}
      <Text className="text-xl font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>
      {description ? (
        <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
          {description}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 pt-1">
        {amountLabel ? (
          <Text className="text-base font-bold text-active">{amountLabel}</Text>
        ) : null}
        <Text className="text-sm text-muted">·</Text>
        <Text className="text-sm text-muted">{whenLabel}</Text>
        <Text className="text-sm text-muted">·</Text>
        <Text className="text-sm text-muted">{locationLabel}</Text>
      </View>
      <RequestTagsLine slugs={tagSlugs} />
    </View>
  );
}
