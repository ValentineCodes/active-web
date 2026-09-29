import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';

/** Categories were removed from the product; keep a stable empty API for legacy imports. */
export type ServiceCategory = {
  slug: string;
  label: string;
  tagline: string;
  icon: never;
};

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async (): Promise<ServiceCategory[]> => [],
    staleTime: Infinity,
  });
}

export function useCategoryIndex() {
  const query = useCategories();
  return {
    ...query,
    data: query.data ? new Map<string, ServiceCategory>() : undefined,
  };
}
