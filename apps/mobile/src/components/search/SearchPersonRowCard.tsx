import { Pressable, Text, View } from 'react-native';

import { IdentityVerifiedBadge } from '@/components/profile/IdentityVerifiedBadge';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/Stars';
import type { SearchPersonRow } from '@/features/search/discovery-types';

export function SearchPersonRowCard({
  person,
  onPress,
}: {
  person: SearchPersonRow;
  onPress: () => void;
}) {
  const title = person.display_name ?? person.username;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, @${person.username}`}
      className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated p-3 active:opacity-90"
    >
      <Avatar path={person.avatar_path} name={title} size="md" />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {title}
          </Text>
          {person.identity_verified ? <IdentityVerifiedBadge size={16} /> : null}
        </View>
        <Text className="text-sm text-muted">@{person.username}</Text>
        {person.bio ? (
          <Text className="text-sm text-muted" numberOfLines={2}>
            {person.bio}
          </Text>
        ) : null}
        {person.rating_count != null && person.rating_count > 0 ? (
          <StarRating average={person.rating_average} count={person.rating_count} size="sm" />
        ) : null}
      </View>
    </Pressable>
  );
}