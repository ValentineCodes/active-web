import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import { type DiscoverPayload, parseDiscoverPayload } from '@/features/search/discovery-types';

export type SearchDiscoverCategory = 'top' | 'requests' | 'people' | 'projects';

export const SEARCH_DISCOVER_PAGE_SIZE = 20;

export async function searchDiscover(
  category: SearchDiscoverCategory,
  query: string,
  latitude: number | null,
  longitude: number | null,
  offset = 0,
) {
  const { data, error } = await supabase.rpc('search_discover', {
    p_category: category,
    p_query: query,
    p_latitude: latitude ?? undefined,
    p_longitude: longitude ?? undefined,
    p_limit: SEARCH_DISCOVER_PAGE_SIZE,
    p_offset: offset,
  });

  if (error) throw error;
  return parseDiscoverPayload((data ?? {}) as DiscoverPayload);
}

export function discoverSliceCount(payload: DiscoverPayload, category: SearchDiscoverCategory) {
  if (category === 'people') return payload.people?.length ?? 0;
  if (category === 'projects') return payload.projects?.length ?? 0;
  if (category === 'requests') return payload.requests?.length ?? 0;
  return (
    (payload.requests?.length ?? 0) +
    (payload.people?.length ?? 0) +
    (payload.projects?.length ?? 0)
  );
}

export function useSearchDiscover(
  category: SearchDiscoverCategory,
  query: string,
  latitude: number | null,
  longitude: number | null,
  enabled: boolean,
) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.searchDiscover(category, trimmed, latitude, longitude),
    queryFn: () => searchDiscover(category, trimmed, latitude, longitude, 0),
    enabled: enabled && trimmed.length > 0 && category === 'top',
  });
}

export function useSearchDiscoverInfinite(
  category: SearchDiscoverCategory,
  query: string,
  latitude: number | null,
  longitude: number | null,
  enabled: boolean,
) {
  const trimmed = query.trim();
  const canPaginate = category !== 'top';

  return useInfiniteQuery({
    queryKey: [...queryKeys.searchDiscover(category, trimmed, latitude, longitude), 'infinite'],
    enabled: enabled && trimmed.length > 0 && canPaginate,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const data = await searchDiscover(category, trimmed, latitude, longitude, pageParam);
      return { offset: pageParam, data };
    },
    getNextPageParam: (lastPage) => {
      const count = discoverSliceCount(lastPage.data, category);
      if (count < SEARCH_DISCOVER_PAGE_SIZE) return undefined;
      return lastPage.offset + SEARCH_DISCOVER_PAGE_SIZE;
    },
  });
}