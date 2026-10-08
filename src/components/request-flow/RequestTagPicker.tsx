import {
  CategorizedTagPicker,
  groupTagsByCategory,
} from '@/components/request-flow/CategorizedTagPicker';
import { MAX_REQUEST_TAGS, useTagCatalogue, type RequestTag } from '@/features/requests/tags';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

type RequestTagPickerProps = {
  selected: RequestTag[];
  onChange: (next: RequestTag[]) => void;
};

function capSelectedTags(tags: RequestTag[]) {
  return tags.slice(0, MAX_REQUEST_TAGS);
}

export function RequestTagPicker({ selected, onChange }: RequestTagPickerProps) {
  const catalogue = useTagCatalogue();
  const sections = groupTagsByCategory(catalogue.data ?? []);

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
