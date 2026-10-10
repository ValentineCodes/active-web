import { CONVERSATION_ATTACHMENTS } from '@/config';
import type { ConversationAttachmentKind } from '@/features/requests/conversation-media';

export const CONVERSATION_ATTACHMENT_USER_ERRORS = {
  unsupportedType: "This file type isn't supported.",
  tooLarge: 'This file is too large.',
  uploadFailed: "We couldn't upload this file. Try again.",
} as const;

const MIME_BY_KIND = {
  image: new Set<string>(CONVERSATION_ATTACHMENTS.mimeTypes.image),
  video: new Set<string>(CONVERSATION_ATTACHMENTS.mimeTypes.video),
  file: new Set<string>(CONVERSATION_ATTACHMENTS.mimeTypes.file),
} as const;

const EXT_BY_KIND = {
  image: new Set<string>(CONVERSATION_ATTACHMENTS.extensions.image),
  video: new Set<string>(CONVERSATION_ATTACHMENTS.extensions.video),
  file: new Set<string>(CONVERSATION_ATTACHMENTS.extensions.file),
} as const;

const BLOCKED_EXT = new Set<string>(CONVERSATION_ATTACHMENTS.blockedExtensions);
const BLOCKED_MIME = new Set<string>(CONVERSATION_ATTACHMENTS.blockedMimeTypes);

const USER_ERROR_MESSAGES = new Set<string>(Object.values(CONVERSATION_ATTACHMENT_USER_ERRORS));

export function normalizeConversationMime(mime: string | null | undefined): string {
  return mime?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function conversationAttachmentMaxBytes(kind: ConversationAttachmentKind): number {
  return CONVERSATION_ATTACHMENTS.maxBytes[kind];
}

export function mimeKindFromWhitelist(mime: string): ConversationAttachmentKind | null {
  const normalized = normalizeConversationMime(mime);
  if (!normalized || BLOCKED_MIME.has(normalized)) return null;
  if (MIME_BY_KIND.image.has(normalized)) return 'image';
  if (MIME_BY_KIND.video.has(normalized)) return 'video';
  if (MIME_BY_KIND.file.has(normalized)) return 'file';
  return null;
}

export function extensionFromFileName(name: string | null, uri: string): string | null {
  const fromName = name?.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length > 0 && fromName.length <= 8) return fromName;
  const fromUri = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (fromUri && fromUri.length > 0 && fromUri.length <= 8) return fromUri;
  return null;
}

function extensionMatchesMime(extension: string, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return extension === 'jpg' || extension === 'jpeg';
    case 'image/png':
      return extension === 'png';
    case 'image/webp':
      return extension === 'webp';
    case 'image/heic':
    case 'image/heif':
      return extension === 'heic' || extension === 'heif';
    case 'video/mp4':
      return extension === 'mp4' || extension === '3gp' || extension === '3g2';
    case 'video/quicktime':
      return extension === 'mov';
    case 'video/3gpp':
      return extension === '3gp';
    case 'video/3gpp2':
      return extension === '3g2';
    case 'application/pdf':
      return extension === 'pdf';
    case 'text/plain':
      return extension === 'txt';
    case 'text/csv':
      return extension === 'csv';
    case 'application/msword':
      return extension === 'doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extension === 'docx';
    case 'application/vnd.ms-excel':
      return extension === 'xls';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return extension === 'xlsx';
    case 'application/rtf':
      return extension === 'rtf';
    case 'application/vnd.oasis.opendocument.text':
      return extension === 'odt';
    case 'application/vnd.oasis.opendocument.spreadsheet':
      return extension === 'ods';
    default:
      return false;
  }
}

export function assertExtensionAllowed(
  extension: string | null,
  kind: ConversationAttachmentKind,
  mimeType: string,
) {
  if (extension && BLOCKED_EXT.has(extension)) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }

  if (!extension) return;

  const allowed = EXT_BY_KIND[kind];
  if (!allowed.has(extension)) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }

  if (!extensionMatchesMime(extension, mimeType)) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
}

export function assertConversationAttachmentMime(
  mimeType: string,
  kindHint: ConversationAttachmentKind,
): ConversationAttachmentKind {
  const normalized = normalizeConversationMime(mimeType);
  if (!normalized || BLOCKED_MIME.has(normalized)) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }

  const fromMime = mimeKindFromWhitelist(normalized);
  if (!fromMime) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }

  if (kindHint === 'file' && fromMime !== 'file') {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
  if (kindHint !== 'file' && fromMime !== kindHint) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }

  return fromMime;
}

export function assertConversationAttachmentSize(bytes: number, kind: ConversationAttachmentKind) {
  if (bytes < 1) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
  if (bytes > conversationAttachmentMaxBytes(kind)) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.tooLarge);
  }
}

export function assertConversationAttachmentFileSignature(bytes: Uint8Array, mimeType: string) {
  const normalized = normalizeConversationMime(mimeType);
  if (normalized === 'text/plain' || normalized === 'text/csv') return;
  if (
    normalized === 'application/msword' ||
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalized === 'application/vnd.ms-excel' ||
    normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    normalized === 'application/rtf' ||
    normalized === 'application/vnd.oasis.opendocument.text' ||
    normalized === 'application/vnd.oasis.opendocument.spreadsheet'
  ) {
    return;
  }

  if (bytes.byteLength < 4) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp =
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  const isIsoBmff =
    bytes.byteLength >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70;
  const isHeic =
    isIsoBmff &&
    ((bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x69 && bytes[11] === 0x63) ||
      (bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x69 && bytes[11] === 0x66) ||
      (bytes[8] === 0x6d && bytes[9] === 0x69 && bytes[10] === 0x66 && bytes[11] === 0x31));

  if (normalized === 'image/jpeg' && !isJpeg) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
  if (normalized === 'image/png' && !isPng) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
  if (normalized === 'image/webp' && !isWebp) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
  if ((normalized === 'image/heic' || normalized === 'image/heif') && !isHeic) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
  if (normalized === 'application/pdf' && !isPdf) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
  if (
    (normalized === 'video/mp4' ||
      normalized === 'video/quicktime' ||
      normalized === 'video/3gpp' ||
      normalized === 'video/3gpp2') &&
    !isIsoBmff
  ) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
}

function mapKnownInfrastructureError(message: string): string | null {
  const lower = message.toLowerCase();
  if (
    lower.includes('jwt') ||
    lower.includes('session') ||
    lower.includes('not authenticated') ||
    lower.includes('invalid claim') ||
    lower.includes('401')
  ) {
    return 'Please sign in again, then retry.';
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch') ||
    lower.includes('connection')
  ) {
    return 'Your connection looks unstable. Check your network and try again.';
  }
  if (
    lower.includes('could not find the function') ||
    lower.includes('pgrst202') ||
    lower.includes('schema cache')
  ) {
    return 'Chat attachments are not enabled on this backend yet. Apply the latest Supabase migrations (pnpm db:migrate or db push), then restart the app.';
  }
  if (lower.includes('bucket not found')) {
    return 'Chat file storage is not set up on this backend. Run Supabase migrations, then try again.';
  }
  return null;
}

export function mapConversationAttachmentError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (USER_ERROR_MESSAGES.has(message)) return message;
    const mapped = mapKnownInfrastructureError(message);
    if (mapped) return mapped;
  }
  if (error instanceof Error) {
    if (USER_ERROR_MESSAGES.has(error.message)) return error.message;
    const mapped = mapKnownInfrastructureError(error.message);
    if (mapped) return mapped;
  }
  return CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed;
}
