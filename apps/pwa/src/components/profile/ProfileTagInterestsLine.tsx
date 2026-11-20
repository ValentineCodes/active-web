'use client';

import type { RequestTag } from '@/features/requests/tags';

export function ProfileTagInterestsLine({ tags }: { tags: RequestTag[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-xs flex-row flex-wrap justify-center gap-2 px-2">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="rounded-full border border-hairline bg-elevated px-3 py-1.5 text-sm font-medium text-ink"
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}