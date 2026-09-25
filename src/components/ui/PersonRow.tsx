import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/Stars';

/**
 * A person summary row — avatar, name, rating, one line of context. Used anywhere the
 * app introduces "the other person": a nearby requester, a provider who responded, the
 * counterparty on a connected request.
 */
export function PersonRow({
  avatarPath,
  name,
  ratingAverage,
  ratingCount,
  meta,
  size = 'md',
  trailing,
  onPress,
}: {
  avatarPath: string | null | undefined;
  name: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  meta?: string;
  size?: 'sm' | 'md';
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const row = (
    <View className="w-full min-w-0 flex-row items-center gap-3">
      <Avatar path={avatarPath} name={name} size={size} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink" numberOfLines={1}>
          {name}
        </Text>
        {ratingAverage !== undefined ? (
          <StarRating average={ratingAverage ?? null} count={ratingCount ?? 0} />
        ) : null}
        {meta ? <Text className="text-sm text-muted">{meta}</Text> : null}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) return row;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name ? `View ${name}'s profile` : 'View profile'}
    >
      {row}
    </Pressable>
  );
}
