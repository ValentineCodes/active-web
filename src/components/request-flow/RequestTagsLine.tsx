import { View } from 'react-native';

import { TagPill } from '@/components/request-flow/TagPill';
import { normalizeRequestTagSlugs } from '@/features/requests/tags';

/** Request tags as pills — hidden when empty. */
export function RequestTagsLine({ slugs }: { slugs: string[] | null | undefined }) {
  const tags = normalizeRequestTagSlugs(slugs);
  if (tags.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2">
      {tags.map((label) => (
        <TagPill key={label} label={label} selected />
      ))}
    </View>
  );
}
