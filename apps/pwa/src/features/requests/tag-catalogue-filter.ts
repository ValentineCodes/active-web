import type { RequestTag } from '@/features/requests/tags';

export type TagCatalogueSection = {
  category: string;
  tags: RequestTag[];
};

export function groupRequestTagsByCategory(tags: RequestTag[]): TagCatalogueSection[] {
  const byCategory = new Map<string, RequestTag[]>();

  for (const tag of tags) {
    const list = byCategory.get(tag.category) ?? [];
    list.push(tag);
    byCategory.set(tag.category, list);
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, categoryTags]) => ({
      category,
      tags: categoryTags.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Mirrors public.search_tags matching for client-side filtering on the full catalogue. */
export function filterRequestTags(tags: RequestTag[], query: string, limit = 50): RequestTag[] {
  const trimmed = query.trim();
  if (!trimmed) return tags.slice(0, limit);

  const needle = trimmed.toLowerCase();
  const slugNeedle = needle.replace(/^#/, '');

  const matches = tags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(needle) ||
      tag.slug.toLowerCase().includes(slugNeedle) ||
      tag.category.toLowerCase().includes(needle),
  );

  return matches.slice(0, limit);
}
