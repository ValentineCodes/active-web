import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/use-user-id';
import { normalizeUsernameInput, mapUsernameMutationError } from '@/features/profile/username';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type PublicProfileRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  rating_average: number | null;
  rating_count: number | null;
  jobs_completed: number | null;
  requests_completed: number | null;
  identity_verified: boolean;
  crown_tier: string;
  points_main: number | null;
  shield_remaining: number | null;
  crown_public: boolean;
};

async function fetchPublicProfile(username: string) {
  const normalized = username.trim().toLowerCase();
  const { data, error } = await supabase.rpc('get_public_profile', {
    p_username: normalized,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as PublicProfileRow | undefined;
  if (!row?.user_id) {
    throw Object.assign(new Error('Profile not found'), { code: 'not_found' as const });
  }
  return row;
}

export function usePublicProfile(username: string | undefined) {
  const normalized = username?.trim().toLowerCase() ?? '';
  return useQuery({
    queryKey: queryKeys.publicProfile(normalized),
    queryFn: () => fetchPublicProfile(normalized),
    enabled: normalized.length > 0,
  });
}

export function useSetUsername() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (username: string) => {
      const { error } = await supabase.rpc('set_username', {
        p_username: normalizeUsernameInput(username),
      });
      if (error) {
        throw new Error(mapUsernameMutationError(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });
}