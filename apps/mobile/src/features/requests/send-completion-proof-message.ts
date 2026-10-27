import {
  isServerChatProfilePhotoRequiredError,
} from '@/features/requests/chat-send-eligibility';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  abortConversationAttachmentMessage,
  completeConversationChatMessage,
  prepareConversationAttachment,
  reserveConversationChatMessageSlots,
  uploadPreparedConversationAttachmentToSlot,
  type PreparedConversationAttachment,
  type ReservedConversationAttachmentSlot,
} from '@/features/requests/conversation-attachment-upload';
import { COMPLETION_PROOF_MESSAGE_CAPTION } from '@/features/requests/completion-proof';
import type { ConversationPickedAttachment } from '@/features/requests/conversation-media';
import { createConversationClientSendId } from '@/features/requests/conversation-message-send';

export type CompletionProofStagedMedia = {
  localFile: ConversationPickedAttachment;
  kindHint: 'image' | 'video';
  prepared: PreparedConversationAttachment;
};

export type CompletionProofSendSession = {
  clientSendId: string;
  messageId: string | null;
  slots: ReservedConversationAttachmentSlot[];
  storageUploaded: boolean;
  messagePublished: boolean;
  uploadAttempted: boolean;
};

export class CompletionProofUploadFailedError extends Error {
  readonly failure = 'upload' as const;
  readonly session: CompletionProofSendSession;

  constructor(message: string, session: CompletionProofSendSession) {
    super(message);
    this.name = 'CompletionProofUploadFailedError';
    this.session = session;
  }
}

export class CompletionProofMessageSendFailedError extends Error {
  readonly failure = 'send' as const;
  readonly session: CompletionProofSendSession;

  constructor(message: string, session: CompletionProofSendSession) {
    super(message);
    this.name = 'CompletionProofMessageSendFailedError';
    this.session = session;
  }
}

export function createCompletionProofSendSession(): CompletionProofSendSession {
  return {
    clientSendId: createConversationClientSendId(),
    messageId: null,
    slots: [],
    storageUploaded: false,
    messagePublished: false,
    uploadAttempted: false,
  };
}

export async function abortCompletionProofSendSession(session: CompletionProofSendSession): Promise<void> {
  if (!session.messageId || session.messagePublished) {
    return;
  }

  await abortConversationAttachmentMessage(session.messageId);
}

export async function stageCompletionProofMedia(
  localFile: ConversationPickedAttachment,
  kindHint: 'image' | 'video',
): Promise<CompletionProofStagedMedia> {
  const prepared = await prepareConversationAttachment(localFile, kindHint);
  return {
    localFile: {
      ...localFile,
      uri: prepared.localUri,
      mimeType: prepared.mimeType,
      fileSize: prepared.fileSize,
      name: prepared.fileName,
    },
    kindHint,
    prepared,
  };
}

function mapCompletionProofError(error: unknown): Error {
  if (isServerChatProfilePhotoRequiredError(error)) {
    return new Error('Add a profile photo in the app before you can send proof in chat.');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(mapConversationAttachmentError(error));
}

export async function sendCompletionProofMessage(input: {
  conversationId: string;
  staged: CompletionProofStagedMedia;
  session: CompletionProofSendSession;
  onUploadProgress?: (fraction: number) => void;
}): Promise<CompletionProofSendSession> {
  const session: CompletionProofSendSession = {
    ...input.session,
    slots: [...input.session.slots],
  };

  if (session.messagePublished) {
    return session;
  }

  try {
    if (!session.messageId || session.slots.length === 0) {
      const slots = await reserveConversationChatMessageSlots({
        conversationId: input.conversationId,
        caption: COMPLETION_PROOF_MESSAGE_CAPTION,
        plannedAttachments: [input.staged.prepared],
        clientSendId: session.clientSendId,
      });
      session.slots = slots;
      session.messageId = slots[0]?.messageId ?? null;
    }

    const slot = session.slots[0];
    if (!slot || !session.messageId) {
      throw new Error(mapConversationAttachmentError(new Error('upload failed')));
    }

    if (!session.storageUploaded) {
      try {
        const replaceExisting = session.uploadAttempted;
        session.uploadAttempted = true;
        await uploadPreparedConversationAttachmentToSlot({
          slot,
          prepared: input.staged.prepared,
          onProgress: input.onUploadProgress,
          replaceExisting,
        });
        session.storageUploaded = true;
      } catch (error) {
        const message = mapCompletionProofError(error).message;
        throw new CompletionProofUploadFailedError(message, session);
      }
    }

    try {
      await completeConversationChatMessage(session.messageId);
      session.messagePublished = true;
    } catch (error) {
      const message = mapCompletionProofError(error).message;
      throw new CompletionProofMessageSendFailedError(message, session);
    }

    return session;
  } catch (error) {
    if (
      error instanceof CompletionProofUploadFailedError ||
      error instanceof CompletionProofMessageSendFailedError
    ) {
      throw error;
    }
    const mapped = mapCompletionProofError(error);
    if (session.storageUploaded) {
      throw new CompletionProofMessageSendFailedError(mapped.message, session);
    }
    throw new CompletionProofUploadFailedError(mapped.message, session);
  }
}
