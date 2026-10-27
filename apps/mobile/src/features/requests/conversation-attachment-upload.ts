import * as FileSystem from 'expo-file-system/legacy';

import {
  assertConversationAttachmentFileSignature,
  assertConversationAttachmentMime,
  assertConversationAttachmentSize,
  assertExtensionAllowed,
  CONVERSATION_ATTACHMENT_USER_ERRORS,
  extensionFromFileName,
  mapConversationAttachmentError,
} from '@/features/requests/conversation-attachment-policy';
import {
  CONVERSATION_MEDIA_BUCKET,
  type ConversationAttachmentKind,
  type ConversationPickedAttachment,
  inferConversationAttachmentKind,
  resolveConversationAttachmentContentType,
  sanitizeConversationImageForUpload,
} from '@/features/requests/conversation-media';
import type { RequestMessageAttachment } from '@/features/requests/conversation-message-model';
import {
  ConversationAttachmentUploadFailedError,
  ConversationUploadCancelledError,
  type ConversationAttachmentUploadState,
} from '@/features/requests/conversation-attachment-upload-state';
import { readUriBytes, uploadPrivateObject } from '@/features/profile/storage';
import { supabase } from '@/lib/supabase/client';

export type PreparedConversationAttachment = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachmentType: ConversationAttachmentKind;
  /** Local file URI to read bytes from (may differ from the picker URI after image sanitization). */
  localUri: string;
};

export type ConversationChatUploadResult = {
  messageId: string;
  attachment: RequestMessageAttachment;
};

export type ConversationChatMessageUploadResult = {
  messageId: string;
  attachments: RequestMessageAttachment[];
};

export type ConversationUploadItem = {
  localFile: ConversationPickedAttachment;
  kindHint: ConversationAttachmentKind;
  prepared?: PreparedConversationAttachment;
};

function defaultFileName(kind: ConversationAttachmentKind, mimeType: string): string {
  const stamp = Date.now();
  if (kind === 'image') {
    if (mimeType === 'image/png') return `photo-${stamp}.png`;
    if (mimeType === 'image/webp') return `photo-${stamp}.webp`;
    if (mimeType === 'image/heic' || mimeType === 'image/heif') return `photo-${stamp}.heic`;
    return `photo-${stamp}.jpg`;
  }
  if (kind === 'video') {
    return mimeType === 'video/quicktime' ? `video-${stamp}.mov` : `video-${stamp}.mp4`;
  }
  if (mimeType === 'application/pdf') return `document-${stamp}.pdf`;
  if (mimeType === 'text/plain') return `document-${stamp}.txt`;
  if (mimeType === 'text/csv') return `document-${stamp}.csv`;
  if (mimeType === 'application/msword') return `document-${stamp}.doc`;
  if (mimeType === 'application/vnd.ms-excel') return `document-${stamp}.xls`;
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return `document-${stamp}.xlsx`;
  }
  return `document-${stamp}.docx`;
}

function assertValidLocalUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.unsupportedType);
  }
}

async function readLocalFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
  if (typeof info.size !== 'number' || info.size < 1) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
  return info.size;
}

export async function prepareConversationAttachment(
  localFile: ConversationPickedAttachment,
  kindHint: ConversationAttachmentKind,
): Promise<PreparedConversationAttachment> {
  const source =
    kindHint === 'image' ? await sanitizeConversationImageForUpload(localFile) : localFile;

  assertValidLocalUri(source.uri);

  const resolvedMime = resolveConversationAttachmentContentType(source, kindHint);
  const attachmentType = assertConversationAttachmentMime(resolvedMime, kindHint);

  const extension = extensionFromFileName(source.name, source.uri);
  assertExtensionAllowed(extension, attachmentType, resolvedMime);

  const fileSize = await readLocalFileSize(source.uri);
  assertConversationAttachmentSize(fileSize, attachmentType);

  const fileName =
    source.name?.trim() ||
    (extension ? `attachment.${extension}` : defaultFileName(attachmentType, resolvedMime));

  return {
    fileName,
    mimeType: resolvedMime,
    fileSize,
    attachmentType,
    localUri: source.uri,
  };
}

function assertNotCancelled(shouldCancel?: () => boolean) {
  if (shouldCancel?.()) {
    throw new ConversationUploadCancelledError();
  }
}

async function uploadBytesToStorage(
  storagePath: string,
  uri: string,
  mimeType: string,
  kind: ConversationAttachmentKind,
  onProgress?: (fraction: number) => void,
  shouldCancel?: () => boolean,
  options?: { replaceExisting?: boolean },
) {
  assertNotCancelled(shouldCancel);
  const bytes = await readUriBytes(uri);
  assertNotCancelled(shouldCancel);
  assertConversationAttachmentSize(bytes.byteLength, kind);
  assertConversationAttachmentFileSignature(bytes, mimeType);

  try {
    await uploadPrivateObject(CONVERSATION_MEDIA_BUCKET, storagePath, bytes, mimeType, onProgress, {
      upsert: options?.replaceExisting ?? false,
    });
  } catch (error) {
    throw new Error(mapConversationAttachmentError(error));
  }
}

export type ReservedConversationAttachmentSlot = {
  messageId: string;
  attachmentId: string;
  storagePath: string;
};

export async function reserveConversationChatMessageSlots(input: {
  conversationId: string;
  caption: string;
  plannedAttachments: PreparedConversationAttachment[];
  clientSendId?: string | null;
}): Promise<ReservedConversationAttachmentSlot[]> {
  const { data: slots, error } = await supabase.rpc('begin_request_message_with_attachments', {
    p_conversation_id: input.conversationId,
    p_body: input.caption.trim(),
    p_planned_attachments: input.plannedAttachments.map((prepared) => ({
      file_name: prepared.fileName,
      mime_type: prepared.mimeType,
      file_size: prepared.fileSize,
      attachment_type: prepared.attachmentType,
    })),
    p_client_send_id: input.clientSendId ?? undefined,
  });

  if (error) {
    throw new Error(mapConversationAttachmentError(error));
  }

  if (!slots?.length) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }

  const messageId = slots[0]?.message_id;
  if (!messageId) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }

  return slots.map((slot) => {
    if (!slot.attachment_id || !slot.storage_path || slot.message_id !== messageId) {
      throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
    }
    return {
      messageId,
      attachmentId: slot.attachment_id,
      storagePath: slot.storage_path,
    };
  });
}

export async function uploadPreparedConversationAttachmentToSlot(input: {
  slot: ReservedConversationAttachmentSlot;
  prepared: PreparedConversationAttachment;
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
  replaceExisting?: boolean;
}): Promise<void> {
  await uploadBytesToStorage(
    input.slot.storagePath,
    input.prepared.localUri,
    input.prepared.mimeType,
    input.prepared.attachmentType,
    input.onProgress,
    input.shouldCancel,
    { replaceExisting: input.replaceExisting },
  );
}

export async function completeConversationChatMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_request_message_with_attachments', {
    p_message_id: messageId,
  });
  if (error) {
    throw new Error(mapConversationAttachmentError(error));
  }
}

/**
 * Reserve attachment rows, upload to the server-provided private paths, then finalize the message.
 * Conversation membership and messaging rules are enforced by `begin_request_message_with_attachments`.
 */
export async function abortConversationAttachmentMessage(messageId: string) {
  const { error } = await supabase.rpc('abort_request_message_with_attachments', {
    p_message_id: messageId,
  });
  if (error) {
    throw new Error(mapConversationAttachmentError(error));
  }
}

export async function uploadConversationChatMessage(input: {
  conversationId: string;
  userId: string;
  items: ConversationUploadItem[];
  attachmentIds?: string[];
  caption?: string | null;
  clientSendId?: string | null;
  shouldCancel?: () => boolean;
  onUploadProgress?: (fraction: number) => void;
  onAttachmentStateChange?: (
    attachmentId: string,
    state: ConversationAttachmentUploadState,
  ) => void;
  onMessageReserved?: (messageId: string) => void;
}): Promise<ConversationChatMessageUploadResult> {
  const {
    conversationId,
    userId,
    items,
    attachmentIds,
    caption,
    clientSendId,
    shouldCancel,
    onUploadProgress,
    onAttachmentStateChange,
    onMessageReserved,
  } = input;

  const emit = (index: number, state: ConversationAttachmentUploadState) => {
    const id = attachmentIds?.[index];
    if (id) onAttachmentStateChange?.(id, state);
  };

  if (!userId) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
  if (!conversationId) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
  if (items.length < 1) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }

  assertNotCancelled(shouldCancel);

  const preparedItems: {
    item: ConversationUploadItem;
    prepared: PreparedConversationAttachment;
  }[] = [];
  for (let index = 0; index < items.length; index += 1) {
    assertNotCancelled(shouldCancel);
    const item = items[index];
    if (!item) {
      throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
    }
    if (item.prepared) {
      preparedItems.push({ item, prepared: item.prepared });
      continue;
    }
    emit(index, { phase: 'preparing' });
    preparedItems.push({
      item,
      prepared: await prepareConversationAttachment(item.localFile, item.kindHint),
    });
  }

  let messageId: string | null = null;
  let failedAttachmentId: string | null = null;

  try {
    assertNotCancelled(shouldCancel);

    for (let index = 0; index < preparedItems.length; index += 1) {
      emit(index, { phase: 'uploading', progress: 0 });
    }

    let reservedSlots: ReservedConversationAttachmentSlot[];
    try {
      reservedSlots = await reserveConversationChatMessageSlots({
        conversationId,
        caption: caption?.trim() ? caption.trim() : '',
        plannedAttachments: preparedItems.map(({ prepared }) => prepared),
        clientSendId,
      });
    } catch (error) {
      const message = mapConversationAttachmentError(error);
      for (let index = 0; index < preparedItems.length; index += 1) {
        emit(index, { phase: 'failed', errorMessage: message });
      }
      throw error instanceof Error ? error : new Error(message);
    }

    messageId = reservedSlots[0]?.messageId ?? null;
    if (!messageId) {
      throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
    }

    onMessageReserved?.(messageId);

    const slotByAttachmentId = new Map(
      reservedSlots.map((slot) => [slot.attachmentId, slot]),
    );

    for (let index = 0; index < preparedItems.length; index += 1) {
      assertNotCancelled(shouldCancel);

      const entry = preparedItems[index];
      const slot = reservedSlots[index];
      if (!entry) {
        throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
      }
      const { prepared } = entry;
      if (!slot?.storagePath || !slot.attachmentId) {
        throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
      }
      if (slot.messageId !== messageId) {
        throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
      }
      if (!slotByAttachmentId.has(slot.attachmentId)) {
        throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
      }

      const attachmentId = attachmentIds?.[index] ?? null;
      failedAttachmentId = attachmentId;

      emit(index, { phase: 'uploading', progress: 0 });

      const progress =
        onUploadProgress && preparedItems.length > 0
          ? (fraction: number) => {
              const base = index / preparedItems.length;
              const overall = base + fraction / preparedItems.length;
              onUploadProgress(overall);
              emit(index, { phase: 'uploading', progress: fraction });
            }
          : (fraction: number) => {
              emit(index, { phase: 'uploading', progress: fraction });
            };

      try {
        await uploadPreparedConversationAttachmentToSlot({
          slot,
          prepared,
          onProgress: progress,
          shouldCancel,
        });
      } catch (error) {
        const message = mapConversationAttachmentError(error);
        emit(index, { phase: 'failed', errorMessage: message });
        throw new ConversationAttachmentUploadFailedError(attachmentId ?? String(index), message);
      }

      emit(index, { phase: 'uploaded', progress: 1 });
      failedAttachmentId = null;
    }

    assertNotCancelled(shouldCancel);

    await completeConversationChatMessage(messageId);

    const createdAt = new Date().toISOString();

    return {
      messageId,
      attachments: preparedItems.map(({ prepared }, index) => {
        const slot = reservedSlots[index];
        if (!slot?.attachmentId || !slot.storagePath) {
          throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
        }
        return {
          id: slot.attachmentId,
          storagePath: slot.storagePath,
          fileName: prepared.fileName,
          mimeType: prepared.mimeType,
          fileSize: prepared.fileSize,
          attachmentType: prepared.attachmentType,
          createdAt,
        };
      }),
    };
  } catch (error) {
    if (messageId && error instanceof ConversationUploadCancelledError) {
      try {
        await abortConversationAttachmentMessage(messageId);
      } catch {
        // Prefer surfacing the original upload failure.
      }
    }

    if (error instanceof ConversationUploadCancelledError) {
      for (let index = 0; index < items.length; index += 1) {
        emit(index, { phase: 'cancelled' });
      }
      throw error;
    }

    if (error instanceof ConversationAttachmentUploadFailedError) {
      for (let index = 0; index < items.length; index += 1) {
        const id = attachmentIds?.[index];
        if (id && id !== error.failedAttachmentId) {
          emit(index, { phase: 'idle' });
        }
      }
      throw error;
    }

    if (failedAttachmentId) {
      const message = mapConversationAttachmentError(error);
      throw new ConversationAttachmentUploadFailedError(failedAttachmentId, message);
    }

    throw error instanceof Error
      ? error
      : new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }
}

export async function uploadConversationChatAttachment(input: {
  conversationId: string;
  userId: string;
  localFile: ConversationPickedAttachment;
  kindHint: ConversationAttachmentKind;
  caption?: string | null;
  onUploadProgress?: (fraction: number) => void;
}): Promise<ConversationChatUploadResult> {
  const result = await uploadConversationChatMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    caption: input.caption,
    onUploadProgress: input.onUploadProgress,
    items: [{ localFile: input.localFile, kindHint: input.kindHint }],
  });

  const attachment = result.attachments[0];
  if (!attachment) {
    throw new Error(CONVERSATION_ATTACHMENT_USER_ERRORS.uploadFailed);
  }

  return { messageId: result.messageId, attachment };
}

export function optimisticAttachmentFromPick(
  pendingId: string,
  localFile: ConversationPickedAttachment,
  kindHint: ConversationAttachmentKind,
  index = 0,
): RequestMessageAttachment {
  const mimeType = resolveConversationAttachmentContentType(localFile, kindHint);

  return {
    id: `${pendingId}:attachment:${index}`,
    storagePath: '',
    fileName: localFile.name,
    mimeType,
    fileSize: localFile.fileSize ?? null,
    attachmentType: kindHint === 'file' ? 'file' : inferConversationAttachmentKind(mimeType),
    createdAt: new Date().toISOString(),
  };
}

export function optimisticAttachmentsFromPrepared(
  pendingId: string,
  items: PreparedConversationAttachment[],
): RequestMessageAttachment[] {
  const createdAt = new Date().toISOString();
  return items.map((prepared, index) => ({
    id: `${pendingId}:attachment:${index}`,
    storagePath: '',
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    fileSize: prepared.fileSize,
    attachmentType: prepared.attachmentType,
    createdAt,
  }));
}
