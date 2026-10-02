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

type RequestPhotoAsset = { uri: string; mimeType?: string | null };

export async function takeRequestPhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is needed to take a photo.');
  }

  return ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });
}

export async function chooseRequestPhotoFromLibrary() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to choose a photo.');
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.8,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
}

export async function uploadRequestPhoto(
  userId: string,
  asset: RequestPhotoAsset,
): Promise<string> {
  const paths = await uploadRequestPhotos(userId, [asset]);
  const path = paths[0];
  if (!path) throw new Error('Could not upload the photo.');
  return path;
}

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
