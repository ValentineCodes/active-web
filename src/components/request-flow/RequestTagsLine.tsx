import { Text } from 'react-native';

import { normalizeRequestTagSlugs } from '@/features/requests/tags';

/** Subtle tag line — not categories; hidden when empty. */
export function RequestTagsLine({ slugs }: { slugs: string[] | null | undefined }) {
  const tags = normalizeRequestTagSlugs(slugs);
  if (tags.length === 0) return null;

  return (
    <Text className="text-sm text-subtle" numberOfLines={1}>
      {tags.join(' ')}
    </Text>
  );
}
