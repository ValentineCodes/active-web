import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/session';
import { queryKeys } from '@/lib/query/keys';
import { isSupabaseAuthError, recoverSessionOnAuthError } from '@/lib/supabase/auth-recovery';
import { supabase } from '@/lib/supabase/client';

import { hasProfilePhotoReady } from '@/features/requests/chat-send-eligibility';

import { captureProfilePhotoInApp } from './capture-profile-photo';

export { hasProfilePhotoReady };

export { useAvatarUrl } from './avatar-url';

/**
 * Shared so the onboarding gate in the root layout and the screens that render a profile
 * read one cache entry rather than two overlapping ones.
 */
export function profileQueryOptions(userId: string) {
  return {
    queryKey: queryKeys.profile(userId),
    // Fail with a network error instead of staying pending while React Query thinks we're offline.
    networkMode: 'always' as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, avatar_path, avatar_captured_in_app, phone, bio, rating_average, rating_count, jobs_completed, requests_completed, push_notifications_enabled, message_push_enabled, push_payments_wallet_enabled, push_calls_enabled, push_tips_reminders_enabled',
        )
        .eq('id', userId)
        .single();

      if (error) {
        // A device can keep a session across a local db reset; signing out is clearer
        // than leaving someone on a boot error they cannot fix.
        if (error.code === 'PGRST116') {
          await supabase.auth.signOut();
        } else if (isSupabaseAuthError(error)) {
          await recoverSessionOnAuthError();
        }
        throw error;
      }
      return data;
    },
  };
}

export function useProfile() {
  return useQuery(profileQueryOptions(useUserId()));
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
      queryClient.setQueryData(queryKeys.profile(userId), (current) =>
        current ? { ...current, ...patch } : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });
}

/**
 * Profile photos for responding must be captured in-app (camera only). Storage policies key write
 * access off the `<user_id>/` prefix, and confirm_avatar_capture marks the capture as valid.
 *
 * Resolves to `false` when the picker is dismissed, which is not a failure.
 */
export function useCaptureProfilePhoto() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ onProgress }: { onProgress?: (fraction: number) => void } = {}) => {
      const outcome = await captureProfilePhotoInApp(userId, onProgress);
      if (outcome.kind === 'cancelled') return false;
      if (outcome.kind === 'permission_denied') {
        if (!outcome.canAskAgain) {
          throw new Error('Camera access is blocked. Open settings to allow your camera.');
        }
        throw new Error('Camera access is needed for your profile photo.');
      }
      return true;
    },
    onSuccess: (changed) => {
      if (!changed) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.avatarUrl(`${userId}/avatar.jpg`) });
    },
  });
}
