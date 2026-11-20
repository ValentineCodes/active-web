import { useMemo } from 'react';
import { View } from 'react-native';

import { CategorizedTagPicker } from '@/components/request-flow/CategorizedTagPicker';
import { groupRequestTagsByCategory } from '@/features/requests/tag-catalogue-filter';
import { useTagCatalogue, type RequestTag } from '@/features/requests/tags';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function ProjectTagPicker({
  selected,
  onChange,
}: {
  selected: RequestTag[];
  onChange: (next: RequestTag[]) => void;
}) {
  const catalogue = useTagCatalogue();
  const sections = useMemo(
    () => groupRequestTagsByCategory(catalogue.data ?? []),
    [catalogue.data],
  );

  if (showQuerySkeleton(catalogue)) {
    return (
      <View className="gap-3">
        <SkeletonBlock className="h-10 w-full rounded-2xl" />
        <SkeletonBlock className="h-10 w-full rounded-2xl" />
      </View>
    );
  }

  return (
    <CategorizedTagPicker
      sections={sections}
      selected={selected}
      maxSelected={100}
      onChange={onChange}
      loading={catalogue.isPending}
      error={catalogue.isError}
    />
  );
}