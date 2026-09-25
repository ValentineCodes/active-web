import { supabase } from '@/lib/supabase/client';

export const AVATAR_BUCKET = 'avatars';
export const CATALOGUE_BUCKET = 'catalogue';
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const CATALOGUE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const CATALOGUE_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CATALOGUE_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime']);

export function assertCataloguePhotoAsset(asset: {
  mimeType?: string | null;
  fileSize?: number | null;
}) {
  const mime = asset.mimeType ?? 'image/jpeg';
  if (!CATALOGUE_PHOTO_MIME.has(mime)) {
    throw new Error('Use a JPEG, PNG, or WebP photo for your catalogue.');
  }
}

export function assertCatalogueVideoAsset(asset: {
  mimeType?: string | null;
  fileSize?: number | null;
}) {
  const mime = asset.mimeType ?? 'video/mp4';
  if (!CATALOGUE_VIDEO_MIME.has(mime)) {
    throw new Error('Use an MP4 or MOV video for your catalogue.');
  }
  if (asset.fileSize != null && asset.fileSize > CATALOGUE_VIDEO_MAX_BYTES) {
    throw new Error('Your catalogue video must be 50 MB or smaller.');
  }
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/mp4') return 'mp4';
  return 'jpg';
}

/**
 * Local `file://` reads on device report `application/octet-stream`. Callers must pass the
 * picker's MIME type (or a type derived from the file extension) when uploading.
 */
export async function readUriBytes(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected file could not be read.');

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Prefer the picker MIME. Fall back to the URI extension when the device omits it. */
export function contentTypeForAsset(
  asset: { mimeType?: string | null; uri: string },
  kind: 'photo' | 'video',
): string {
  const declared = asset.mimeType?.split(';')[0]?.trim().toLowerCase();
  const extension = asset.uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (
    (declared === 'image/heic' || declared === 'image/heif') &&
    (extension === 'jpg' || extension === 'jpeg')
  ) {
    return 'image/jpeg';
  }
  if (declared && declared !== 'application/octet-stream') return declared;
  if (kind === 'photo') {
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    return 'image/jpeg';
  }

  if (extension === 'mov' || extension === 'qt') return 'video/quicktime';
  return 'video/mp4';
}

export async function uploadPrivateObject(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
  onProgress?: (fraction: number) => void,
) {
  onProgress?.(0);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) throw error;
  onProgress?.(1);
}

export async function removePrivateObject(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
