import { useQuery } from '@tanstack/react-query';

import { REQUEST_MEDIA_BUCKET } from '@/features/requests/request-media';
import { SIGNED_URL_TTL_SECONDS } from '@/features/profile/storage';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export function useRequestAttachmentUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requestAttachmentUrl(path ?? ''),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(REQUEST_MEDIA_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}
