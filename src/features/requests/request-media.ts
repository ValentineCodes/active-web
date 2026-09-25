import * as ImagePicker from 'expo-image-picker';

import {
  assertCataloguePhotoAsset,
  contentTypeForAsset,
  extensionForMime,
  readUriBytes,
  uploadPrivateObject,
} from '@/features/profile/storage';

export const REQUEST_MEDIA_BUCKET = 'request-media';
const REQUEST_PHOTO_LIMIT = 4;

export async function pickRequestPhotos(slotsLeft: number) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to attach pictures.');
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: Math.min(slotsLeft, REQUEST_PHOTO_LIMIT),
    quality: 0.8,
  });
}

export async function uploadRequestPhotos(
  userId: string,
  uris: { uri: string; mimeType?: string | null }[],
): Promise<string[]> {
  const draftKey = `${Date.now()}`;
  const paths: string[] = [];

  for (let index = 0; index < uris.length; index += 1) {
    const asset = uris[index];
    if (!asset) continue;
    assertCataloguePhotoAsset(asset);
    const contentType = contentTypeForAsset({ uri: asset.uri, mimeType: asset.mimeType }, 'photo');
    const extension = extensionForMime(contentType);
    const path = `${userId}/drafts/${draftKey}/${index}.${extension}`;
    const bytes = await readUriBytes(asset.uri);
    await uploadPrivateObject(REQUEST_MEDIA_BUCKET, path, bytes, contentType);
    paths.push(path);
  }

  return paths;
}

export const requestPhotoLimit = REQUEST_PHOTO_LIMIT;
