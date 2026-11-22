import { isServerChatProfilePhotoRequiredError } from '@/features/requests/chat-send-eligibility';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  abortConversationAttachmentMessage,
  prepareConversationAttachment,
  type PreparedConversationAttachment,
  uploadPreparedConversationAttachmentToSlot,
} from '@/features/requests/conversation-attachment-upload';
import type { ConversationPickedAttachment } from '@/features/requests/conversation-media';
import { createConversationClientSendId } from '@/features/requests/conversation-message-send';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type BeginSlot =
  Database['public']['Functions']['begin_project_assignment_submission']['Returns'][number];

export type ProjectAssignmentSubmissionStagedMedia = {
  localFile: ConversationPickedAttachment;
  kindHint: 'image' | 'video' | 'file';
  prepared: PreparedConversationAttachment;
};

export type ProjectAssignmentSubmissionSendSession = {
  clientSendId: string;
  messageId: string | null;
  conversationId: string | null;
  slots: { messageId: string; attachmentId: string; storagePath: string }[];
  storageUploaded: boolean;
  submissionPublished: boolean;
  uploadAttempted: boolean;
};

export class ProjectAssignmentSubmissionUploadFailedError extends Error {
  readonly failure = 'upload' as const;
  readonly session: ProjectAssignmentSubmissionSendSession;

  constructor(message: string, session: ProjectAssignmentSubmissionSendSession) {
    super(message);
    this.name = 'ProjectAssignmentSubmissionUploadFailedError';
    this.session = session;
  }
}

export class ProjectAssignmentSubmissionSendFailedError extends Error {
  readonly failure = 'send' as const;
  readonly session: ProjectAssignmentSubmissionSendSession;

  constructor(message: string, session: ProjectAssignmentSubmissionSendSession) {
    super(message);
    this.name = 'ProjectAssignmentSubmissionSendFailedError';
    this.session = session;
  }
}

export function createProjectAssignmentSubmissionSendSession(): ProjectAssignmentSubmissionSendSession {
  return {
    clientSendId: createConversationClientSendId(),
    messageId: null,
    conversationId: null,
    slots: [],
    storageUploaded: false,
    submissionPublished: false,
    uploadAttempted: false,
  };
}

export async function abortProjectAssignmentSubmissionSendSession(
  session: ProjectAssignmentSubmissionSendSession,
): Promise<void> {
  if (!session.messageId || session.submissionPublished) return;
  await abortConversationAttachmentMessage(session.messageId);
}

function mapProjectSubmissionRpcError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code, message } = error as { code: unknown; message: unknown };
    if (typeof code === 'string' && typeof message === 'string' && message.trim().length > 0) {
      if (code === 'PGRST202') {
        return 'Formal submit needs the latest database migrations. Apply supabase migrations, then retry.';
      }
      if (message.toLowerCase().includes('direct deletion is not allowed')) {
        return 'Could not reset a previous draft. Apply the latest database migrations, then retry.';
      }
      if (
        code === '22023' ||
        code === '55000' ||
        code === 'P0002' ||
        code === '42501' ||
        code.startsWith('23')
      ) {
        return message;
      }
    }
  }
  if (isServerChatProfilePhotoRequiredError(error)) {
    return 'Add a profile photo in the app before you can submit work in chat.';
  }
  const msg = mapConversationAttachmentError(error);
  if (msg.includes('upload this file')) {
    return 'Could not submit deliverables. Try again.';
  }
  return msg;
}

function mapSubmissionError(error: unknown): Error {
  if (isServerChatProfilePhotoRequiredError(error)) {
    return new Error('Add a profile photo in the app before you can submit work in chat.');
  }
  if (error instanceof Error) return error;
  return new Error(mapConversationAttachmentError(error));
}

async function reserveAssignmentSubmissionSlots(input: {
  assignmentId: string;
  milestoneId?: string | null;
  note?: string;
  plannedAttachments: PreparedConversationAttachment[];
}): Promise<{
  conversationId: string;
  messageId: string;
  slots: ProjectAssignmentSubmissionSendSession['slots'];
}> {
  const { data, error } = await supabase.rpc('begin_project_assignment_submission', {
    p_assignment_id: input.assignmentId,
    p_milestone_id: input.milestoneId ?? undefined,
    p_note: input.note ?? undefined,
    p_planned_attachments: input.plannedAttachments.map((prepared) => ({
      file_name: prepared.fileName,
      mime_type: prepared.mimeType,
      file_size: prepared.fileSize,
      attachment_type: prepared.attachmentType,
    })),
  });
  if (error) throw new Error(mapProjectSubmissionRpcError(error));
  if (!data?.length) throw new Error('Could not start submission.');

  const first = data[0] as BeginSlot;
  const conversationId = first.conversation_id;
  const messageId = first.message_id;
  if (!conversationId || !messageId) throw new Error('Could not start submission.');

  return {
    conversationId,
    messageId,
    slots: data
      .filter((slot: BeginSlot) => slot.storage_path && slot.attachment_id)
      .map((slot: BeginSlot) => ({
        messageId: slot.message_id,
        attachmentId: slot.attachment_id,
        storagePath: slot.storage_path,
      })),
  };
}

async function completeAssignmentSubmission(messageId: string): Promise<string> {
  const { data, error } = await supabase.rpc('complete_project_assignment_submission', {
    p_message_id: messageId,
  });
  if (error) {
    throw new Error(mapProjectSubmissionRpcError(error));
  }
  if (!data) throw new Error('Could not finalize submission.');
  return data as string;
}

export async function stageProjectAssignmentSubmissionMedia(
  localFile: ConversationPickedAttachment,
  kindHint: 'image' | 'video' | 'file',
): Promise<ProjectAssignmentSubmissionStagedMedia> {
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

export async function sendProjectAssignmentSubmission(input: {
  assignmentId: string;
  milestoneId?: string | null;
  note?: string;
  stagedItems: ProjectAssignmentSubmissionStagedMedia[];
  session: ProjectAssignmentSubmissionSendSession;
  onUploadProgress?: (fraction: number) => void;
}): Promise<{ session: ProjectAssignmentSubmissionSendSession; submissionId: string }> {
  const session: ProjectAssignmentSubmissionSendSession = {
    ...input.session,
    slots: [...input.session.slots],
  };

  if (session.submissionPublished) {
    throw new Error('Submission already sent.');
  }

  const plannedAttachmentCount = input.stagedItems.length;
  const sessionAttachmentCount = session.slots.length;
  const draftOutOfSync =
    session.messageId &&
    !session.submissionPublished &&
    plannedAttachmentCount !== sessionAttachmentCount;

  try {
    if (
      draftOutOfSync ||
      (session.messageId && input.stagedItems.length < 1 && session.slots.length > 0)
    ) {
      await abortProjectAssignmentSubmissionSendSession(session);
      session.messageId = null;
      session.conversationId = null;
      session.slots = [];
      session.storageUploaded = false;
      session.uploadAttempted = false;
    }

    if (!session.messageId) {
      const reserved = await reserveAssignmentSubmissionSlots({
        assignmentId: input.assignmentId,
        milestoneId: input.milestoneId,
        note: input.note,
        plannedAttachments: input.stagedItems.map((item) => item.prepared),
      });
      session.conversationId = reserved.conversationId;
      session.slots = reserved.slots;
      session.messageId = reserved.messageId;
    }

    if (!session.messageId) {
      throw new Error('Could not start submission.');
    }

    if (!session.storageUploaded) {
      if (session.slots.length < 1) {
        session.storageUploaded = true;
      } else {
        session.uploadAttempted = true;
        for (let index = 0; index < input.stagedItems.length; index += 1) {
          const staged = input.stagedItems[index];
          const slot = session.slots[index];
          if (!staged || !slot) throw new Error('Could not upload file.');
          const progress =
            input.onUploadProgress && input.stagedItems.length > 0
              ? (fraction: number) => {
                  const overall = (index + fraction) / input.stagedItems.length;
                  input.onUploadProgress?.(overall);
                }
              : undefined;
          await uploadPreparedConversationAttachmentToSlot({
            slot,
            prepared: staged.prepared,
            onProgress: progress,
            replaceExisting: true,
          });
        }
        session.storageUploaded = true;
      }
    }

    const submissionId = await completeAssignmentSubmission(session.messageId);
    session.submissionPublished = true;
    return { session, submissionId };
  } catch (error) {
    const mapped = mapSubmissionError(error);
    const uploadWasRequired = session.slots.length > 0;
    if (session.storageUploaded || !uploadWasRequired) {
      throw new ProjectAssignmentSubmissionSendFailedError(mapped.message, session);
    }
    throw new ProjectAssignmentSubmissionUploadFailedError(mapped.message, session);
  }
}
