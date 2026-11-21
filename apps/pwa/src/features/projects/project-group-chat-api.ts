import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export function useProjectGroupConversationMembers(
  conversationId: string | undefined,
  enabled: boolean,
) {
  const id = conversationId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectGroupConversationMembers(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_group_conversation_members', {
        p_conversation_id: id,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && id.length > 0,
  });
}