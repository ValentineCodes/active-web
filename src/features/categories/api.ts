import { useQuery } from '@tanstack/react-query';
import type { Ionicons } from '@expo/vector-icons';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type ServiceCategory = {
  slug: string;
  label: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const categoriesQuery = {
  queryKey: queryKeys.categories,
  // Reference data, versioned with the schema. It changes on deploy, not at runtime.
  staleTime: Infinity,
  queryFn: async (): Promise<ServiceCategory[]> => {
    const { data, error } = await supabase
      .from('service_categories')
      .select('slug, label, tagline, icon')
      .order('sort_order');

    if (error) throw error;

    // public.service_categories.icon holds Ionicons glyph names; the migration that adds
    // a category is what guarantees the name is real.
    return data as ServiceCategory[];
  },
};

export function useCategories() {
  return useQuery(categoriesQuery);
}

/** Categories keyed by slug, for the many places that render a label from a stored slug. */
export function useCategoryIndex() {
  return useQuery({
    ...categoriesQuery,
    select: (rows) => new Map(rows.map((row) => [row.slug, row])),
  });
}
