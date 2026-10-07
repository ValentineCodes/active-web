import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { CONVERSATION_ATTACHMENTS } from '@/config';
import { contentTypeForAsset } from '@/features/profile/storage';

export const CONVERSATION_MEDIA_BUCKET = 'conversation-media';

export type ConversationPickedAttachment = {
  uri: string;
  mimeType: string | null;
  name: string | null;
  /** Video duration when the picker provides it. */
  durationMs?: number | null;
  /** Byte size when known before upload (e.g. document picker). */
  fileSize?: number | null;
};

export type ConversationAttachmentKind = 'image' | 'video' | 'file';

function durationMsFromPickerAsset(asset: ImagePicker.ImagePickerAsset): number | null {
  const raw = asset.duration;
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return raw >= 1000 ? Math.round(raw) : Math.round(raw * 1000);
}

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): ConversationPickedAttachment {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    name: asset.fileName ?? null,
    durationMs: durationMsFromPickerAsset(asset),
    fileSize: asset.fileSize ?? null,
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

  const format =
    declared === 'image/png' || extension === 'png'
      ? ImageManipulator.SaveFormat.PNG
      : declared === 'image/webp' || extension === 'webp'
        ? ImageManipulator.SaveFormat.WEBP
        : ImageManipulator.SaveFormat.JPEG;

  const manipulated = await ImageManipulator.manipulateAsync(attachment.uri, [], {
    compress: 0.85,
    format,
  });

  const info = await FileSystem.getInfoAsync(manipulated.uri);
  const sanitizedSize =
    info.exists && typeof info.size === 'number' ? info.size : attachment.fileSize;
  const mimeType =
    format === ImageManipulator.SaveFormat.PNG
      ? 'image/png'
      : format === ImageManipulator.SaveFormat.WEBP
        ? 'image/webp'
        : 'image/jpeg';

  let name = attachment.name;
  if (name && format === ImageManipulator.SaveFormat.JPEG) {
    name = name.replace(/\.(heic|heif|png|webp)$/i, '.jpg');
  }

  return {
    uri: manipulated.uri,
    mimeType,
    name,
    durationMs: attachment.durationMs,
    fileSize: sanitizedSize,
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

export async function takeConversationPhoto(): Promise<ConversationPickedAttachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is needed to take a photo.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return null;
  return fromImageAsset(result.assets[0]);
}

export async function recordConversationVideo(): Promise<ConversationPickedAttachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is needed to record a video.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
  });
  if (result.canceled || !result.assets[0]) return null;
  return fromImageAsset(result.assets[0]);
}

export async function pickConversationPhotosFromLibrary(
  maxCount: number,
): Promise<ConversationPickedAttachment[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to select photos.');
  }

  const limit = Math.max(1, Math.min(maxCount, CONVERSATION_ATTACHMENTS.maxPerMessage));
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.85,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }

  return result.assets.map(fromImageAsset);
}

export async function chooseConversationFile(): Promise<ConversationPickedAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    name: asset.name ?? null,
    fileSize: asset.size ?? null,
  };
}
