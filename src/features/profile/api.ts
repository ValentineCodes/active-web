import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { useUserId } from '@/features/auth/session';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

const AVATAR_BUCKET = 'avatars';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
          'id, display_name, avatar_path, phone, bio, rating_average, rating_count, jobs_completed, requests_completed',
        )
        .eq('id', userId)
        .single();

      if (error) throw error;
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
  });
}

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
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/**
 * Picks an image and replaces the caller's avatar. Storage policies key write access off
 * the `<user_id>/` prefix, so the path is not a client-side convention.
 *
 * Resolves to `false` when the picker is dismissed, which is not a failure.
 */
export function useUploadAvatar() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled) return false;

      const [asset] = result.assets;
      if (!asset?.base64) throw new Error('The selected image could not be read.');

      const bytes = Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0));
      const path = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

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
