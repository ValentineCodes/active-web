import { TagPill } from '@/components/request-flow/TagPill';
import { normalizeRequestTagSlugs } from '@/features/requests/tags';

export function RequestTagsLine({ slugs }: { slugs: string[] | null | undefined }) {
  const tags = normalizeRequestTagSlugs(slugs);
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {tags.map((label, index) => (
        <TagPill key={`${label}:${index}`} label={label} selected />
      ))}
    </div>
  );
}
