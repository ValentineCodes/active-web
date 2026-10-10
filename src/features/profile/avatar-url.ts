import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import { AVATAR_BUCKET, SIGNED_URL_TTL_SECONDS } from './storage';

/**
 * Avatars sit in a private bucket, so display needs a signed URL. Cached just short of
 * its own lifetime so a scrolling list does not re-sign the same object.
 */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.avatarUrl(path ?? ''),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    networkMode: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}
