import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { filterRequestTags } from '@/features/requests/tag-catalogue-filter';
import { getMemoryTagCatalogue, persistTagCatalogue } from '@/features/requests/tag-catalogue-storage';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export const MAX_REQUEST_TAGS = 3;

/** Catalogue stays warm for a week; disk cache covers cold starts. */
const TAG_CATALOGUE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type RequestTag = {
  id: string;
  name: string;
  slug: string;
  category: string;
};

export function normalizeRequestTagSlugs(slugs: string[] | null | undefined): string[] {
  if (!slugs?.length) return [];
  return slugs.filter(Boolean).slice(0, MAX_REQUEST_TAGS);
}

function primarySlugForCatalogueName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchTagCatalogueLabel(label: string, catalogue: RequestTag[]): RequestTag | undefined {
  const slugMatch = catalogue.find((tag) => tag.slug === label);
  if (slugMatch) return slugMatch;

  const nameMatches = catalogue.filter((tag) => tag.name === label);
  if (nameMatches.length === 0) return undefined;
  if (nameMatches.length === 1) return nameMatches[0];

  const primarySlug = primarySlugForCatalogueName(label);
  return nameMatches.find((tag) => tag.slug === primarySlug) ?? nameMatches[0];
}

/** API `tag_slugs` holds catalogue display names (or slugs); names are not always unique. */
export function resolveRequestTagsFromApiLabels(
  labels: string[],
  catalogue: RequestTag[],
): RequestTag[] {
  const seen = new Set<string>();
  const resolved: RequestTag[] = [];

  for (const label of labels.slice(0, MAX_REQUEST_TAGS)) {
    const tag = matchTagCatalogueLabel(label, catalogue);
    if (tag && !seen.has(tag.id)) {
      seen.add(tag.id);
      resolved.push(tag);
    }
  }

  return resolved;
}

function mapTagRows(
  rows: { tag_id: string; name: string; slug: string; category?: string | null }[],
): RequestTag[] {
  const tags: RequestTag[] = [];
  for (const row of rows) {
    if (!row.tag_id || !row.slug || !row.name) continue;
    tags.push({
      id: row.tag_id,
      name: row.name,
      slug: row.slug,
      category: row.category ?? 'General',
    });
  }
  return tags;
}

export async function loadRequestTagCatalogue(): Promise<RequestTag[]> {
  const tags = await fetchTagCatalogueFromServer();
  await persistTagCatalogue(tags);
  return tags;
}

/** Server validates tag UUIDs; resolve from a fresh catalogue by slug (disk cache can hold stale ids). */
export async function resolveRequestTagIdsForRpc(
  tags: Pick<RequestTag, 'slug'>[],
): Promise<string[] | undefined> {
  if (tags.length === 0) return undefined;

  const catalogue = await loadRequestTagCatalogue();
  const bySlug = new Map(catalogue.map((tag) => [tag.slug, tag.id]));
  const ids: string[] = [];

  for (const tag of tags.slice(0, MAX_REQUEST_TAGS)) {
    const id = bySlug.get(tag.slug);
    if (!id) {
      throw new Error(
        'One or more tags are no longer available. Update your tag choices and try again.',
      );
    }
    ids.push(id);
  }

  return ids;
}

async function fetchTagCatalogueFromServer(): Promise<RequestTag[]> {
  const catalogue = await supabase.rpc('list_tag_catalogue');
  if (!catalogue.error) {
    return mapTagRows(catalogue.data ?? []);
  }

  const search = await supabase.rpc('search_tags', { p_query: '', p_limit: 200 });
  if (search.error) throw search.error;

  return mapTagRows(search.data ?? []);
}

export function useTagCatalogue() {
  return useQuery({
    queryKey: queryKeys.requestTagsCatalogue,
    queryFn: loadRequestTagCatalogue,
    staleTime: TAG_CATALOGUE_STALE_MS,
    gcTime: TAG_CATALOGUE_STALE_MS,
    placeholderData: () => getMemoryTagCatalogue(),
    refetchOnMount: true,
  });
}

export function useSearchTags(query: string) {
  const catalogue = useTagCatalogue();
  const trimmed = query.trim();

  const data = useMemo(() => {
    if (!catalogue.data) return undefined;
    return filterRequestTags(catalogue.data, trimmed, 50);
  }, [catalogue.data, trimmed]);

  return {
    data,
    isPending: catalogue.isPending && catalogue.data === undefined,
    isError: catalogue.isError,
  };
}
