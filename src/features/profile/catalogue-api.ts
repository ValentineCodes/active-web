import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { useUserId } from '@/features/auth/session';
import {
  PROFILE_CATALOGUE_PHOTO_LIMIT,
  PROFILE_CATALOGUE_VIDEO_LIMIT,
} from '@/features/domain/model';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import { toUserMessage } from '@/lib/supabase/errors';

import {
  assertCataloguePhotoAsset,
  assertCatalogueVideoAsset,
  CATALOGUE_BUCKET,
  contentTypeForAsset,
  extensionForMime,
  readUriBytes,
  removePrivateObject,
  SIGNED_URL_TTL_SECONDS,
  uploadPrivateObject,
} from './storage';

export type CatalogueRow = {
  id: string;
  kind: 'photo' | 'video';
  storage_path: string;
  sort_order: number;
};

const CATALOGUE_COLUMNS = 'id, kind, storage_path, sort_order';

export function catalogueQueryOptions(userId: string) {
  return {
    queryKey: queryKeys.catalogue(userId),
    queryFn: async (): Promise<CatalogueRow[]> => {
      const { data, error } = await supabase
        .from('profile_catalogue_media')
        .select(CATALOGUE_COLUMNS)
        .eq('user_id', userId)
        .order('kind')
        .order('sort_order');

      if (error) throw error;
      return data;
    },
  };
}

export function useProviderCatalogue(userId: string | undefined) {
  return useQuery({
    ...catalogueQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
}

export function useMyCatalogue() {
  return useProviderCatalogue(useUserId());
}

export function useCatalogueMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.catalogueMediaUrl(path ?? ''),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CATALOGUE_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}

async function pickCataloguePhotoSource(): Promise<'camera' | 'library' | null> {
  // Alert is platform-native and keeps catalogue picking lightweight without new UI chrome.
  const { Alert } = await import('react-native');
  return new Promise((resolve) => {
    Alert.alert(
      'Add photos',
      'You can choose several from your library, up to the 6-photo limit.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Take photo', onPress: () => resolve('camera') },
        { text: 'Choose from library', onPress: () => resolve('library') },
      ],
    );
  });
}

async function pickCatalogueVideoSource(): Promise<'camera' | 'library' | null> {
  const { Alert } = await import('react-native');
  return new Promise((resolve) => {
    Alert.alert('Add a video', 'One short clip is enough to show how you work.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Record video', onPress: () => resolve('camera') },
      { text: 'Choose from library', onPress: () => resolve('library') },
    ]);
  });
}

async function launchCataloguePhotoPicker(source: 'camera' | 'library', slotsLeft: number) {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is needed to take a catalogue photo.');
    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to choose a catalogue photo.');
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: slotsLeft,
    quality: 0.7,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
}

async function launchCatalogueVideoPicker(source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error('Camera access is needed to record a catalogue video.');
    return ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
    });
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to choose a catalogue video.');
  }

  return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
}

function invalidateCatalogue(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.catalogue(userId) });
}

export function useAddCataloguePhoto() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ onProgress }: { onProgress?: (fraction: number) => void } = {}) => {
      const existing = queryClient.getQueryData<CatalogueRow[]>(queryKeys.catalogue(userId)) ?? [];
      const photoCount = existing.filter((row) => row.kind === 'photo').length;
      if (photoCount >= PROFILE_CATALOGUE_PHOTO_LIMIT) {
        throw new Error(`You can add up to ${PROFILE_CATALOGUE_PHOTO_LIMIT} catalogue photos.`);
      }

      const slotsLeft = PROFILE_CATALOGUE_PHOTO_LIMIT - photoCount;
      const source = await pickCataloguePhotoSource();
      if (!source) return false;

      const result = await launchCataloguePhotoPicker(source, slotsLeft);
      if (result.canceled) return false;

      const selected = result.assets.filter((asset) => asset.uri).slice(0, slotsLeft);
      if (selected.length === 0) throw new Error('The selected photo could not be read.');

      const skipped: string[] = [];
      if (result.assets.length > slotsLeft) {
        skipped.push(`Only ${slotsLeft} more ${slotsLeft === 1 ? 'photo fits' : 'photos fit'}.`);
      }

      const ready: { path: string; bytes: Uint8Array; mimeType: string }[] = [];
      for (const [index, asset] of selected.entries()) {
        try {
          const mimeType = contentTypeForAsset(asset, 'photo');
          assertCataloguePhotoAsset({ ...asset, mimeType });
          const bytes = await readUriBytes(asset.uri);
          ready.push({
            bytes,
            mimeType,
            path: `${userId}/catalogue/photo-${Date.now()}-${index}.${extensionForMime(mimeType)}`,
          });
        } catch (error) {
          skipped.push(error instanceof Error ? error.message : toUserMessage(error));
        }
      }

      if (ready.length === 0) {
        throw new Error(skipped[0] ?? 'None of the selected photos could be added.');
      }

      const uploaded: string[] = [];
      const sortOrder = existing
        .filter((row) => row.kind === 'photo')
        .reduce((max, row) => Math.max(max, row.sort_order), -1);

      try {
        for (const [index, item] of ready.entries()) {
          await uploadPrivateObject(
            CATALOGUE_BUCKET,
            item.path,
            item.bytes,
            item.mimeType,
            (fraction) => onProgress?.((index + fraction) / ready.length),
          );
          uploaded.push(item.path);
        }

        const { error } = await supabase.from('profile_catalogue_media').insert(
          ready.map((item, index) => ({
            user_id: userId,
            kind: 'photo' as const,
            storage_path: item.path,
            sort_order: sortOrder + 1 + index,
          })),
        );
        if (error) throw error;
      } catch (error) {
        for (const path of uploaded) {
          await removePrivateObject(CATALOGUE_BUCKET, path);
        }
        throw error;
      }

      return { added: ready.length, skipped };
    },
    onSuccess: (result) => {
      if (result && result.added > 0) invalidateCatalogue(queryClient, userId);
    },
  });
}

export function useRemoveCatalogueMedia() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mediaId: string) => {
      const { data, error } = await supabase
        .from('profile_catalogue_media')
        .delete()
        .eq('id', mediaId)
        .eq('user_id', userId)
        .select('storage_path')
        .single();

      if (error) throw error;
      await removePrivateObject(CATALOGUE_BUCKET, data.storage_path);
    },
    onSuccess: () => invalidateCatalogue(queryClient, userId),
  });
}

async function reorderPhotoSortOrders(photos: CatalogueRow[]) {
  for (const [index, photo] of photos.entries()) {
    const { error } = await supabase
      .from('profile_catalogue_media')
      .update({ sort_order: 100 + index })
      .eq('id', photo.id);

    if (error) throw error;
  }

  for (const [index, photo] of photos.entries()) {
    const { error } = await supabase
      .from('profile_catalogue_media')
      .update({ sort_order: index })
      .eq('id', photo.id);

    if (error) throw error;
  }
}

export function useMoveCataloguePhoto() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { mediaId: string; direction: 'left' | 'right' }) => {
      const rows = queryClient.getQueryData<CatalogueRow[]>(queryKeys.catalogue(userId)) ?? [];
      const photos = rows
        .filter((row) => row.kind === 'photo')
        .sort((a, b) => a.sort_order - b.sort_order);
      const index = photos.findIndex((row) => row.id === input.mediaId);
      if (index < 0) throw new Error('Photo not found.');

      const target = input.direction === 'left' ? index - 1 : index + 1;
      if (target < 0 || target >= photos.length) return;

      const next = photos.slice();
      const current = next[index];
      const neighbor = next[target];
      if (!current || !neighbor) return;

      next[index] = neighbor;
      next[target] = current;
      await reorderPhotoSortOrders(next);
    },
    onSuccess: () => invalidateCatalogue(queryClient, userId),
  });
}

export function useSetCatalogueVideo() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ onProgress }: { onProgress?: (fraction: number) => void } = {}) => {
      const existing = queryClient.getQueryData<CatalogueRow[]>(queryKeys.catalogue(userId)) ?? [];
      const currentVideo = existing.find((row) => row.kind === 'video');

      const source = await pickCatalogueVideoSource();
      if (!source) return false;

      const result = await launchCatalogueVideoPicker(source);
      if (result.canceled) return false;

      const [asset] = result.assets;
      if (!asset?.uri) throw new Error('The selected video could not be read.');

      const mimeType = contentTypeForAsset(asset, 'video');
      assertCatalogueVideoAsset({ ...asset, mimeType });

      const bytes = await readUriBytes(asset.uri);
      if (bytes.byteLength > 50 * 1024 * 1024) {
        throw new Error('Your catalogue video must be 50 MB or smaller.');
      }

      const path = `${userId}/catalogue/video-${Date.now()}.${extensionForMime(mimeType)}`;
      await uploadPrivateObject(CATALOGUE_BUCKET, path, bytes, mimeType, onProgress);

      if (currentVideo) {
        const { error: replaceError } = await supabase
          .from('profile_catalogue_media')
          .update({ storage_path: path })
          .eq('id', currentVideo.id);

        if (replaceError) {
          await removePrivateObject(CATALOGUE_BUCKET, path);
          throw replaceError;
        }

        await removePrivateObject(CATALOGUE_BUCKET, currentVideo.storage_path);
        return true;
      }

      const { error } = await supabase.from('profile_catalogue_media').insert({
        user_id: userId,
        kind: 'video',
        storage_path: path,
        sort_order: 0,
      });

      if (error) {
        await removePrivateObject(CATALOGUE_BUCKET, path);
        throw error;
      }

      return true;
    },
    onSuccess: (changed) => {
      if (changed) invalidateCatalogue(queryClient, userId);
    },
  });
}

export function useRemoveCatalogueVideo() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const rows = queryClient.getQueryData<CatalogueRow[]>(queryKeys.catalogue(userId)) ?? [];
      const video = rows.find((row) => row.kind === 'video');
      if (!video) return;

      const { error } = await supabase
        .from('profile_catalogue_media')
        .delete()
        .eq('id', video.id)
        .eq('user_id', userId);

      if (error) throw error;
      await removePrivateObject(CATALOGUE_BUCKET, video.storage_path);
    },
    onSuccess: () => invalidateCatalogue(queryClient, userId),
  });
}

export function catalogueCounts(rows: CatalogueRow[] | undefined) {
  const photos = rows?.filter((row) => row.kind === 'photo').length ?? 0;
  const videos = rows?.filter((row) => row.kind === 'video').length ?? 0;
  return { photos, videos };
}

export function catalogueLimitsLabel() {
  return `Up to ${PROFILE_CATALOGUE_PHOTO_LIMIT} photos and ${PROFILE_CATALOGUE_VIDEO_LIMIT} video — all optional.`;
}
