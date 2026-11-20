import { useInfiniteQuery } from '@tanstack/react-query';

import { HOME_BROWSE_PAGE_SIZE } from '@/features/requests/browse-api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Nullable, RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

export type PublicProject = Nullable<
  RpcRow<Functions['browse_open_projects']['Returns']>,
  | 'description'
  | 'attachment_path'
  | 'creator_display_name'
  | 'creator_avatar_path'
  | 'location_label'
  | 'posted_at'
>;

function nextBrowseOffset(lastPage: PublicProject[], pageParam: number) {
  if (lastPage.length < HOME_BROWSE_PAGE_SIZE) return undefined;
  return pageParam + HOME_BROWSE_PAGE_SIZE;
}

export function useBrowseOpenProjectsInfinite(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  return useInfiniteQuery({
    queryKey: [...queryKeys.browseOpenProjects, 'pages'],
    enabled,
    initialPageParam: 0,
    staleTime: 15_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('browse_open_projects', {
        p_limit: HOME_BROWSE_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as PublicProject[];
    },
    getNextPageParam: (lastPage, _pages, pageParam) => nextBrowseOffset(lastPage, pageParam),
  });
}