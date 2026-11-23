'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHasSession } from '@/features/auth/use-user-id';
import { invalidateConversationInboxQueries } from '@/features/requests/conversation-api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export function useWorkerProjectPreHandshakeConversation(projectId: string, enabled: boolean) {
  const hasSession = useHasSession();
  const id = projectId.trim();
  return useQuery({
    queryKey: queryKeys.workerProjectPreHandshakeConversation(id),
    enabled: hasSession && enabled && id.length > 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('get_worker_project_pre_handshake_conversation', {
        p_project_id: id,
      });
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useOpenProjectPreHandshakeConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data, error } = await supabase.rpc('open_project_pre_handshake_conversation', {
        p_assignment_id: assignmentId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (conversationId) => {
      invalidateConversationInboxQueries(queryClient);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.resolvedRequestConversation(conversationId),
      });
    },
  });
}