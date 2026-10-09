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

function mapTagRows(
  rows: { tag_id: string; name: string; slug: string; category?: string | null }[],
): RequestTag[] {
  return rows.map((row) => ({
    id: row.tag_id,
    name: row.name,
    slug: row.slug,
    category: row.category ?? 'General',
  }));
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
    queryFn: async (): Promise<RequestTag[]> => {
      const tags = await fetchTagCatalogueFromServer();
      await persistTagCatalogue(tags);
      return tags;
    },
    staleTime: TAG_CATALOGUE_STALE_MS,
    gcTime: TAG_CATALOGUE_STALE_MS,
    placeholderData: () => getMemoryTagCatalogue(),
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
