'use client';

import { useQuery } from '@tanstack/react-query';

import { CONVERSATION_MEDIA_BUCKET } from '@/features/requests/conversation-media';
import { SIGNED_URL_TTL_SECONDS } from '@/features/profile/storage';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export function useConversationAttachmentUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversationAttachmentUrl(path ?? ''),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CONVERSATION_MEDIA_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}
