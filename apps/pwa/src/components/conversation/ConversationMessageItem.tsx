'use client';

import { memo, type ReactNode } from 'react';

import { AttachmentMessageBubble } from '@/components/conversation/AttachmentMessageBubble';
import { GroupChatMessageShell } from '@/components/conversation/GroupChatMessageShell';
import { ProjectAssignmentSubmissionMessageBubble } from '@/components/conversation/ProjectAssignmentSubmissionMessageBubble';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { SystemMessageRow } from '@/components/conversation/SystemMessageRow';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import {
  isSystemMessage,
  isTextMessage,
  messageHasAttachments,
} from '@/features/requests/conversation-message-model';
import { isProjectAssignmentSubmissionMessage } from '@/features/projects/project-assignment-submission-message';

export const ConversationMessageItem = memo(function ConversationMessageItem({
  message,
  isOutgoing,
  viewerUserId,
  outgoingUploadStateByAttachmentId,
  isProjectGroupChat,
  senderDisplayNameByUserId,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  viewerUserId?: string | null;
  outgoingUploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
  isProjectGroupChat?: boolean;
  senderDisplayNameByUserId?: ReadonlyMap<string, string>;
}) {
  const wrapGroupMessage = (node: ReactNode) => (
    <GroupChatMessageShell
      showSenderName={Boolean(isProjectGroupChat)}
      isOutgoing={isOutgoing}
      senderName={
        message.senderDisplayName ??
        senderDisplayNameByUserId?.get(message.senderId) ??
        null
      }
    >
      {node}
    </GroupChatMessageShell>
  );

  if (isSystemMessage(message)) {
    return <SystemMessageRow message={message} viewerUserId={viewerUserId} />;
  }

  if (isTextMessage(message)) {
    if (isProjectAssignmentSubmissionMessage(message)) {
      return wrapGroupMessage(
        <ProjectAssignmentSubmissionMessageBubble
          message={message}
          isOutgoing={isOutgoing}
          uploadStateByAttachmentId={outgoingUploadStateByAttachmentId}
        />,
      );
    }

    const hasBody = message.body.trim().length > 0;
    const hasAttachments = messageHasAttachments(message);

    if (!hasBody && !hasAttachments) {
      return null;
    }

    if (hasAttachments) {
      return wrapGroupMessage(
        <AttachmentMessageBubble
          message={message}
          isOutgoing={isOutgoing}
          uploadStateByAttachmentId={outgoingUploadStateByAttachmentId}
        />,
      );
    }

    if (hasBody) {
      return wrapGroupMessage(<MessageBubble message={message} isOutgoing={isOutgoing} />);
    }

    return null;
  }

  return <SystemMessageRow message={message} viewerUserId={viewerUserId} />;
});