import { Text, View } from 'react-native';

import type { RequestTag } from '@/features/requests/tags';

export function ProfileTagInterestsLine({ tags }: { tags: RequestTag[] }) {
  if (tags.length === 0) return null;

  return (
    <View className="max-w-sm flex-row flex-wrap justify-center gap-2 px-2">
      {tags.map((tag) => (
        <View key={tag.id} className="rounded-full border border-hairline bg-elevated px-3 py-1.5">
          <Text className="text-sm font-medium text-ink">{tag.name}</Text>
        </View>
      ))}
    </View>
  );
}
