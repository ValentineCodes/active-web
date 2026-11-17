import { Text, View } from 'react-native';

import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { formatAgo } from '@/lib/format';

import type { ReceivedRating } from '@/features/profile/reviews-api';

export function ProfileReviewRow({ review, showDivider }: { review: ReceivedRating; showDivider?: boolean }) {
  const name = review.raterDisplayName?.trim() || 'Community member';
  const comment = review.comment?.trim();
  const value = Math.min(5, Math.max(1, Math.round(review.stars)));

  return (
    <View>
    {showDivider ? <View className="h-px bg-hairline" /> : null}
    <View className="gap-3 py-5">
      {comment ? (
        <Text className="text-base leading-6 text-ink" accessibilityRole="text">
          “{comment}”
        </Text>
      ) : null}
      <View className="flex-row items-center gap-3">
        <AvatarWithViewer path={review.raterAvatarPath} name={name} size="sm" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted">{formatAgo(review.createdAt)}</Text>
        </View>
        <View
          className="shrink-0 flex-row items-center gap-1"
          accessibilityRole="image"
          accessibilityLabel={`${value} out of 5 stars`}
        >
          <Text className="text-sm font-bold text-warning">★</Text>
          <Text className="text-sm font-bold text-warning">{value}</Text>
        </View>
      </View>
    </View>
    </View>
  );
}