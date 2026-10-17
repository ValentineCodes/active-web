import type { RequestMessage } from '@/features/requests/conversation-message-model';

export function createConversationClientSendId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function assertConversationMessageSendable(body: string, attachmentCount: number) {
  const trimmed = body.trim();
  if (trimmed.length === 0 && attachmentCount < 1) {
    throw new Error('Message cannot be empty');
  }
}

export function buildOptimisticOutgoingAttachmentMessage(input: {
  pendingMessageId: string;
  senderId: string;
  body: string;
  attachments: {
    id: string;
    prepared: {
      fileName: string;
      mimeType: string;
      fileSize: number;
      attachmentType: 'image' | 'video' | 'file';
      localUri: string;
    };
  }[];
}): RequestMessage {
  const createdAt = new Date().toISOString();
  return {
    id: input.pendingMessageId,
    senderId: input.senderId,
    messageType: 'text',
    body: input.body,
    metadata: null,
    attachments: input.attachments.map((row) => ({
      id: row.id,
      storagePath: '',
      fileName: row.prepared.fileName,
      mimeType: row.prepared.mimeType,
      fileSize: row.prepared.fileSize,
      attachmentType: row.prepared.attachmentType,
      createdAt,
      localPreviewUri: row.prepared.localUri,
    })),
    createdAt,
    readAt: null,
  };
}
