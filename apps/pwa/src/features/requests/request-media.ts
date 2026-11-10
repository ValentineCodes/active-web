import {
  assertCataloguePhotoAsset,
  contentTypeForAsset,
  extensionForMime,
  readUriBytes,
  uploadPrivateObject,
} from '@/features/profile/storage';

export const REQUEST_MEDIA_BUCKET = 'request-media';
const REQUEST_PHOTO_LIMIT = 4;

export type RequestPhotoAsset = {
  uri: string;
  mimeType?: string | null;
  file?: File;
};

function fileFromInput(input: HTMLInputElement): File | null {
  return input.files?.[0] ?? null;
}

function assetFromFile(file: File): RequestPhotoAsset {
  const uri = URL.createObjectURL(file);
  return { uri, mimeType: file.type || null, file };
}

export async function takeRequestPhoto(): Promise<RequestPhotoAsset | null> {
  return pickSingleImage({ capture: 'environment' });
}

export async function chooseRequestPhotoFromLibrary(): Promise<RequestPhotoAsset | null> {
  return pickSingleImage();
}

async function pickSingleImage(options?: { capture?: string }): Promise<RequestPhotoAsset | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.multiple = false;
    if (options?.capture) input.capture = options.capture;
    input.onchange = () => {
      const file = fileFromInput(input);
      resolve(file ? assetFromFile(file) : null);
    };
    input.click();
  });
}

export async function uploadRequestPhoto(userId: string, asset: RequestPhotoAsset): Promise<string> {
  const paths = await uploadRequestPhotos(userId, [asset]);
  const path = paths[0];
  if (!path) throw new Error('Could not upload the photo.');
  return path;
}

export async function pickRequestPhotos(slotsLeft: number): Promise<RequestPhotoAsset[]> {
  const limit = Math.min(slotsLeft, REQUEST_PHOTO_LIMIT);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.multiple = limit > 1;
    input.onchange = () => {
      const files = input.files ? [...input.files] : [];
      resolve(files.slice(0, limit).map(assetFromFile));
    };
    input.click();
  });
}

export async function uploadRequestPhotos(
  userId: string,
  assets: RequestPhotoAsset[],
): Promise<string[]> {
  const draftKey = `${Date.now()}`;
  const paths: string[] = [];

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    if (!asset) continue;
    assertCataloguePhotoAsset(asset);
    const contentType = contentTypeForAsset({ uri: asset.uri, mimeType: asset.mimeType }, 'photo');
    const extension = extensionForMime(contentType);
    const path = `${userId}/drafts/${draftKey}/${index}.${extension}`;
    const bytes = asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : await readUriBytes(asset.uri);
    await uploadPrivateObject(REQUEST_MEDIA_BUCKET, path, bytes, contentType);
    paths.push(path);
    if (!asset.file) URL.revokeObjectURL(asset.uri);
  }

  return paths;
}

export const requestPhotoLimit = REQUEST_PHOTO_LIMIT;
