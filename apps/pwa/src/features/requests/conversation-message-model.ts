import type { Database, Json } from '@/lib/supabase/database.types';

export type ConversationMessageType = Database['public']['Enums']['conversation_message_type'];

export type ConversationAttachmentType =
  Database['public']['Enums']['conversation_attachment_type'];

/** Known system timeline events stored in `request_messages.metadata`. */
export type ConversationSystemEvent = 'voice_call' | 'request_lifecycle';

export type VoiceCallSystemMetadata = {
  event: 'voice_call';
  callId: string;
  status: 'started' | 'ended' | 'missed' | 'declined';
  durationSeconds?: number;
};

export type ConversationMessageMetadata = VoiceCallSystemMetadata | Record<string, unknown>;

export type RequestMessageAttachment = {
  id: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string;
  fileSize: number | null;
  attachmentType: ConversationAttachmentType;
  createdAt: string;
  /** Local file URI for optimistic outgoing attachment bubbles before upload completes. */
  localPreviewUri?: string;
};

export type RequestMessage = {
  id: string;
  senderId: string;
  messageType: ConversationMessageType;
  body: string;
  metadata: ConversationMessageMetadata | null;
  attachments: RequestMessageAttachment[];
  createdAt: string;
  readAt: string | null;
};

export function parseRequestMessageAttachments(
  value: Json | null | undefined,
): RequestMessageAttachment[] {
  if (!value || !Array.isArray(value)) return [];

  const attachments: RequestMessageAttachment[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const record = row as Record<string, Json | undefined>;
    const id = record.id;
    const storagePath = record.storage_path;
    const mimeType = record.mime_type;
    const attachmentType = record.attachment_type;
    const createdAt = record.created_at;
    if (
      typeof id !== 'string' ||
      typeof storagePath !== 'string' ||
      typeof mimeType !== 'string' ||
      typeof attachmentType !== 'string' ||
      typeof createdAt !== 'string'
    ) {
      continue;
    }
    if (attachmentType !== 'image' && attachmentType !== 'video' && attachmentType !== 'file') {
      continue;
    }

    attachments.push({
      id,
      storagePath,
      fileName: typeof record.file_name === 'string' ? record.file_name : null,
      mimeType,
      fileSize: typeof record.file_size === 'number' ? record.file_size : null,
      attachmentType,
      createdAt,
    });
  }

  return attachments;
}

export function isTextMessage(message: RequestMessage): boolean {
  return message.messageType === 'text';
}

export function messageHasAttachments(message: RequestMessage): boolean {
  return message.attachments.length > 0;
}

export function isSystemMessage(message: RequestMessage): boolean {
  return message.messageType === 'system';
}
