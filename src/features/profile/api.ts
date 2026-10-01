import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { useUserId } from '@/features/auth/session';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import { AVATAR_BUCKET, readUriBytes, uploadPrivateObject } from './storage';

export { useAvatarUrl } from './avatar-url';

/**
 * Shared so the onboarding gate in the root layout and the screens that render a profile
 * read one cache entry rather than two overlapping ones.
 */
export function profileQueryOptions(userId: string) {
  return {
    queryKey: queryKeys.profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, avatar_path, avatar_captured_in_app, phone, bio, rating_average, rating_count, jobs_completed, requests_completed, push_notifications_enabled, message_push_enabled',
        )
        .eq('id', userId)
        .single();

      if (error) {
        // A device can keep a session across a local db reset; signing out is clearer
        // than leaving someone on a boot error they cannot fix.
        if (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === '42501') {
          await supabase.auth.signOut();
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

export function hasProfilePhotoReady(
  profile:
    | {
        avatar_path: string | null;
        avatar_captured_in_app: boolean;
      }
    | null
    | undefined,
) {
  return Boolean(profile?.avatar_path && profile.avatar_captured_in_app);
}

export function useSaveProfile() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: { display_name?: string; bio?: string | null }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
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
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera access is needed for your profile photo.');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled) return false;

      const [asset] = result.assets;
      if (!asset?.uri) throw new Error('The photo could not be read.');

      const bytes = await readUriBytes(asset.uri);

      const path = `${userId}/avatar.jpg`;
      await uploadPrivateObject(AVATAR_BUCKET, path, bytes, 'image/jpeg', onProgress);

      const { error } = await supabase.rpc('confirm_avatar_capture', { p_storage_path: path });
      if (error) throw error;
      return true;
    },
    onSuccess: (changed) => {
      if (!changed) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.avatarUrl(`${userId}/avatar.jpg`) });
    },
  });
}

/** @deprecated Use useCaptureProfilePhoto — gallery uploads cannot satisfy Active requirements. */
export const useUploadAvatar = useCaptureProfilePhoto;
