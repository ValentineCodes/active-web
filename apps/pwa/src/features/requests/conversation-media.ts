import { CONVERSATION_ATTACHMENTS } from '@/config/index';
import { contentTypeForAsset } from '@/features/profile/storage';

export const CONVERSATION_MEDIA_BUCKET = 'conversation-media';

export type ConversationPickedAttachment = {
  uri: string;
  mimeType: string | null;
  name: string | null;
  durationMs?: number | null;
  fileSize?: number | null;
  file?: File;
};

export type ConversationAttachmentKind = 'image' | 'video' | 'file';

function assetFromFile(file: File): ConversationPickedAttachment {
  return {
    uri: URL.createObjectURL(file),
    mimeType: file.type || null,
    name: file.name,
    fileSize: file.size,
    file,
  };
}

function mimeTypeFromFileExtension(extension: string | null): string | null {
  if (!extension) return null;
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'rtf':
      return 'application/rtf';
    case 'odt':
      return 'application/vnd.oasis.opendocument.text';
    case 'ods':
      return 'application/vnd.oasis.opendocument.spreadsheet';
    default:
      return null;
  }
}

export function inferConversationAttachmentKind(contentType: string): ConversationAttachmentKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return 'file';
}

async function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the image.'));
    img.src = uri;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the image.'))),
      mime,
      mime === 'image/jpeg' ? 0.85 : undefined,
    );
  });
}

/** Re-encode images so location/device EXIF is not stored in conversation-media. */
export async function sanitizeConversationImageForUpload(
  attachment: ConversationPickedAttachment,
): Promise<ConversationPickedAttachment> {
  const declared = attachment.mimeType?.split(';')[0]?.trim().toLowerCase();
  const extension =
    attachment.name?.split('.').pop()?.toLowerCase() ??
    attachment.uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  const isImage =
    declared?.startsWith('image/') ||
    extension === 'jpg' ||
    extension === 'jpeg' ||
    extension === 'png' ||
    extension === 'webp' ||
    extension === 'heic' ||
    extension === 'heif';

  if (!isImage) {
    return attachment;
  }

  const mimeType =
    declared === 'image/png' || extension === 'png'
      ? 'image/png'
      : declared === 'image/webp' || extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

  const img = await loadImage(attachment.uri);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(img, 0, 0);

  const blob = await canvasToBlob(canvas, mimeType);
  const file = new File([blob], attachment.name ?? `photo-${Date.now()}.jpg`, { type: mimeType });
  URL.revokeObjectURL(attachment.uri);

  let name = attachment.name;
  if (name && mimeType === 'image/jpeg') {
    name = name.replace(/\.(heic|heif|png|webp)$/i, '.jpg');
  }

  return {
    uri: URL.createObjectURL(file),
    mimeType,
    name,
    durationMs: attachment.durationMs,
    fileSize: file.size,
    file,
  };
}

export function resolveConversationAttachmentContentType(
  attachment: ConversationPickedAttachment,
  kindHint: ConversationAttachmentKind,
): string {
  if (kindHint !== 'file') {
    return contentTypeForAsset(
      { uri: attachment.uri, mimeType: attachment.mimeType },
      kindHint === 'video' ? 'video' : 'photo',
    );
  }

  const declared = attachment.mimeType?.split(';')[0]?.trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;

  const extension =
    attachment.name?.split('.').pop()?.toLowerCase() ??
    attachment.uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  return mimeTypeFromFileExtension(extension ?? null) ?? declared ?? 'application/octet-stream';
}

function pickFiles(accept: string, multiple: boolean, capture?: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.capture = capture;
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.click();
  });
}

export async function takeConversationPhoto(): Promise<ConversationPickedAttachment | null> {
  const files = await pickFiles('image/*', false, 'environment');
  const file = files[0];
  return file ? assetFromFile(file) : null;
}

export async function recordConversationVideo(): Promise<ConversationPickedAttachment | null> {
  const files = await pickFiles('video/*', false, 'environment');
  const file = files[0];
  return file ? assetFromFile(file) : null;
}

export async function pickConversationPhotosFromLibrary(
  maxCount: number,
): Promise<ConversationPickedAttachment[]> {
  const limit = Math.max(1, Math.min(maxCount, CONVERSATION_ATTACHMENTS.maxPerMessage));
  const files = await pickFiles('image/*', limit > 1);
  return files.slice(0, limit).map(assetFromFile);
}

export async function chooseConversationFile(): Promise<ConversationPickedAttachment | null> {
  const accept = [
    ...CONVERSATION_ATTACHMENTS.mimeTypes.file,
    ...CONVERSATION_ATTACHMENTS.mimeTypes.image,
    ...CONVERSATION_ATTACHMENTS.mimeTypes.video,
  ].join(',');
  const files = await pickFiles(accept, false);
  const file = files[0];
  return file ? assetFromFile(file) : null;
}
