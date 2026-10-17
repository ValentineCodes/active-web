import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RequestTag } from '@/features/requests/tags';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export const MAX_PROFILE_TAG_INTERESTS = 5;

export function useNotificationTagInterests() {
  return useQuery({
    queryKey: queryKeys.notificationTagInterests,
    queryFn: async (): Promise<RequestTag[]> => {
      const { data, error } = await supabase.rpc('list_notification_tag_interests');

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.tag_id,
        name: row.name,
        slug: row.slug,
        category: 'category' in row && row.category ? String(row.category) : 'General',
      }));
    },
  });
}

export function useUpdateNotificationTagInterests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tags: RequestTag[]) => {
      const { error } = await supabase.rpc('set_notification_tag_interests', {
        p_tag_ids: tags.slice(0, MAX_PROFILE_TAG_INTERESTS).map((tag) => tag.id),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationTagInterests });
    },
  });
}
