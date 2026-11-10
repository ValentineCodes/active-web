'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/use-user-id';
import { PROFILE_CATALOGUE_PHOTO_LIMIT } from '@/features/domain/model';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

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

export function useMyCatalogue() {
  const userId = useUserId();
  return useQuery({
    ...catalogueQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
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

function invalidateCatalogue(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.catalogue(userId) });
}

async function fileToBytes(file: File) {
  const uri = URL.createObjectURL(file);
  try {
    return await readUriBytes(uri);
  } finally {
    URL.revokeObjectURL(uri);
  }
}

export function useAddCataloguePhoto() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const existing = queryClient.getQueryData<CatalogueRow[]>(queryKeys.catalogue(userId)) ?? [];
      const photoCount = existing.filter((row) => row.kind === 'photo').length;
      if (photoCount >= PROFILE_CATALOGUE_PHOTO_LIMIT) {
        throw new Error(`You can add up to ${PROFILE_CATALOGUE_PHOTO_LIMIT} profile photos.`);
      }

      const slotsLeft = PROFILE_CATALOGUE_PHOTO_LIMIT - photoCount;
      const selected = files.slice(0, slotsLeft);
      if (selected.length === 0) return 0;

      const ready: { path: string; bytes: Uint8Array; mimeType: string }[] = [];
      for (const [index, file] of selected.entries()) {
        const mimeType = contentTypeForAsset({ mimeType: file.type, uri: file.name }, 'photo');
        assertCataloguePhotoAsset({ mimeType, fileSize: file.size });
        const bytes = await fileToBytes(file);
        ready.push({
          bytes,
          mimeType,
          path: `${userId}/catalogue/photo-${Date.now()}-${index}.${extensionForMime(mimeType)}`,
        });
      }

      const uploaded: string[] = [];
      const sortOrder = existing
        .filter((row) => row.kind === 'photo')
        .reduce((max, row) => Math.max(max, row.sort_order), -1);

      try {
        for (const item of ready) {
          await uploadPrivateObject(CATALOGUE_BUCKET, item.path, item.bytes, item.mimeType);
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

      return ready.length;
    },
    onSuccess: (added) => {
      if (added && added > 0) invalidateCatalogue(queryClient, userId);
    },
  });
}

export function useSetCatalogueVideo() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const existing = queryClient.getQueryData<CatalogueRow[]>(queryKeys.catalogue(userId)) ?? [];
      const currentVideo = existing.find((row) => row.kind === 'video');

      const mimeType = contentTypeForAsset({ mimeType: file.type, uri: file.name }, 'video');
      assertCatalogueVideoAsset({ mimeType, fileSize: file.size });

      const bytes = await fileToBytes(file);
      const path = `${userId}/catalogue/video-${Date.now()}.${extensionForMime(mimeType)}`;
      await uploadPrivateObject(CATALOGUE_BUCKET, path, bytes, mimeType);

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
        return;
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
    },
    onSuccess: () => invalidateCatalogue(queryClient, userId),
  });
}
