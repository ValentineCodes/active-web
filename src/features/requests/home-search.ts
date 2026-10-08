import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

const RECENTS_KEY = 'home-request-search-recents';
const MAX_RECENTS = 15;

export async function readSearchRecents(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export async function prependSearchRecent(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return readSearchRecents();

  const existing = await readSearchRecents();
  const lower = trimmed.toLowerCase();
  const next = [trimmed, ...existing.filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    MAX_RECENTS,
  );
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

export async function clearSearchRecents(): Promise<void> {
  await AsyncStorage.removeItem(RECENTS_KEY);
}

export async function recordRequestSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;

  const { error } = await supabase.rpc('record_request_search', { p_query: trimmed });
  if (error) throw error;
}

export function useSearchQuerySuggestions(prefix: string) {
  const trimmed = prefix.trim();

  return useQuery({
    queryKey: queryKeys.requestSearchSuggestions(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('search_request_queries', {
        p_prefix: trimmed,
        p_limit: 20,
      });
      if (error) throw error;
      return (data ?? []).map((row) => row.normalized_query);
    },
  });
}
