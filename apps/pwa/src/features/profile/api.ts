import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/use-user-id';
import { isSupabaseAuthError, recoverSessionOnAuthError } from '@/lib/supabase/auth-recovery';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import type { ProfileRow } from './types';

const PROFILE_COLUMNS =
  'id, display_name, avatar_path, avatar_captured_in_app, phone, bio, rating_average, rating_count, jobs_completed, requests_completed, push_notifications_enabled, message_push_enabled, push_payments_wallet_enabled, push_calls_enabled, push_tips_reminders_enabled';

export function profileQueryOptions(userId: string) {
  return {
    queryKey: queryKeys.profile(userId),
    networkMode: 'always' as const,
    queryFn: async (): Promise<ProfileRow> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          await supabase.auth.signOut();
        } else if (isSupabaseAuthError(error)) {
          await recoverSessionOnAuthError();
        }
        throw error;
      }
      return data as ProfileRow;
    },
  };
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    ...profileQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
}

export function useMyProfile() {
  const userId = useUserId();
  return useProfile(userId);
}

export function useSaveProfile() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: { display_name?: string; bio?: string | null }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      queryClient.setQueryData(queryKeys.profile(userId), (current: ProfileRow | undefined) =>
        current ? { ...current, ...patch } : current,
      );
    },
  });
}

export { hasProfilePhotoReady } from '@/features/profile/profile-photo-policy';
