import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export const MAX_REQUEST_TAGS = 3;

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

export function useSearchTags(query: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.requestTagsSearch(trimmed),
    queryFn: async (): Promise<RequestTag[]> => {
      const { data, error } = await supabase.rpc('search_tags', {
        p_query: trimmed,
        p_limit: 50,
      });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.tag_id,
        name: row.name,
        slug: row.slug,
        category: row.category ?? 'General',
      }));
    },
    staleTime: 60_000,
  });
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

export function useTagCatalogue() {
  return useQuery({
    queryKey: queryKeys.requestTagsCatalogue,
    queryFn: async (): Promise<RequestTag[]> => {
      const catalogue = await supabase.rpc('list_tag_catalogue');
      if (!catalogue.error) {
        return mapTagRows(catalogue.data ?? []);
      }

      const search = await supabase.rpc('search_tags', { p_query: '', p_limit: 200 });
      if (search.error) throw search.error;

      return mapTagRows(search.data ?? []);
    },
    staleTime: 60_000 * 60,
  });
}
