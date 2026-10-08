import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';

type RequestReviewBeforePostCardProps = {
  title: string;
  description: string;
  amountLabel: string | null;
  whenLabel: string;
  tagSlugs: string[];
  previewUri?: string | null;
};

export function RequestReviewBeforePostCard({
  title,
  description,
  amountLabel,
  whenLabel,
  tagSlugs,
  previewUri,
}: RequestReviewBeforePostCardProps) {
  return (
    <View className="gap-4 rounded-2xl border border-hairline bg-elevated p-4">
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

      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Title</Text>
        <Text className="text-xl font-bold text-ink">{title}</Text>
      </View>

      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Description
        </Text>
        <Text className="text-sm leading-5 text-muted">{description}</Text>
      </View>

      <View className="flex-row gap-4">
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Offer</Text>
          <Text className="text-2xl font-bold text-active">{amountLabel ?? '—'}</Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">When</Text>
          <Text className="text-base font-semibold text-ink">{whenLabel}</Text>
        </View>
      </View>

      <RequestTagsLine slugs={tagSlugs} />
    </View>
  );
}
