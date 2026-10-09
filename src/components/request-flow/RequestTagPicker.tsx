import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { CategorizedTagPicker } from '@/components/request-flow/CategorizedTagPicker';
import { groupRequestTagsByCategory } from '@/features/requests/tag-catalogue-filter';
import { MAX_REQUEST_TAGS, useTagCatalogue, type RequestTag } from '@/features/requests/tags';
import { afterUiSettled } from '@/lib/after-ui-settled';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

type RequestTagPickerProps = {
  selected: RequestTag[];
  onChange: (next: RequestTag[]) => void;
};

function capSelectedTags(tags: RequestTag[]) {
  return tags.slice(0, MAX_REQUEST_TAGS);
}

function RequestTagPickerSkeleton() {
  return (
    <View className="gap-4">
      <SkeletonBlock className="h-12 w-full rounded-2xl" />
      <View className="gap-3">
        <SkeletonBlock className="h-5 w-40 rounded-md" />
        <View className="flex-row flex-wrap gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-full" />
          <SkeletonBlock className="h-10 w-28 rounded-full" />
          <SkeletonBlock className="h-10 w-20 rounded-full" />
        </View>
      </View>
    </View>
  );
}

export function RequestTagPicker({ selected, onChange }: RequestTagPickerProps) {
  const catalogue = useTagCatalogue();
  const sections = useMemo(
    () => groupRequestTagsByCategory(catalogue.data ?? []),
    [catalogue.data],
  );

  return (
    <CategorizedTagPicker
      sections={sections}
      selected={selected}
      maxSelected={MAX_REQUEST_TAGS}
      onChange={(next) => onChange(capSelectedTags(next))}
      loading={showQuerySkeleton(catalogue)}
      error={catalogue.isError}
    />
  );
}

/** Mounts the full picker after the wizard step transition finishes. */
export function RequestTagPickerAfterNavigation(props: RequestTagPickerProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => afterUiSettled(() => setReady(true)), []);

  if (!ready) return <RequestTagPickerSkeleton />;
  return <RequestTagPicker {...props} />;
}
