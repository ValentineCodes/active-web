'use client';

import { useEffect, useMemo, useState } from 'react';

import { CategorizedTagPicker } from '@/components/request-flow/CategorizedTagPicker';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { groupRequestTagsByCategory } from '@/features/requests/tag-catalogue-filter';
import { MAX_REQUEST_TAGS, useTagCatalogue, type RequestTag } from '@/features/requests/tags';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

function capSelectedTags(tags: RequestTag[]) {
  return tags.slice(0, MAX_REQUEST_TAGS);
}

function RequestTagPickerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonBlock className="h-12 w-full rounded-2xl" />
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-5 w-40 rounded-md" />
        <div className="flex flex-row flex-wrap gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-full" />
          <SkeletonBlock className="h-10 w-28 rounded-full" />
          <SkeletonBlock className="h-10 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function RequestTagPicker({
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
export function RequestTagPickerAfterNavigation(props: {
  selected: RequestTag[];
  onChange: (next: RequestTag[]) => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) return <RequestTagPickerSkeleton />;
  return <RequestTagPicker {...props} />;
}
