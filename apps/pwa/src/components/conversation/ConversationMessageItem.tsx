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
import { cn } from '@/lib/cn';

function ChatMessageColumn({
  isOutgoing,
  isProjectGroupChat,
  children,
}: {
  isOutgoing: boolean;
  isProjectGroupChat?: boolean;
  children: ReactNode;
}) {
  const wideIncomingGroup = Boolean(isProjectGroupChat) && !isOutgoing;
  return (
    <div
      className={cn(
        'flex w-max shrink-0 flex-col',
        wideIncomingGroup ? 'max-w-[92%]' : 'max-w-[85%]',
        isOutgoing ? 'items-end' : 'items-start',
      )}
    >
      {children}
    </div>
  );
}

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
  const wrapForDisplay = (node: ReactNode) => (
    <ChatMessageColumn isOutgoing={isOutgoing} isProjectGroupChat={isProjectGroupChat}>
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
    </ChatMessageColumn>
  );

  if (isSystemMessage(message)) {
    return <SystemMessageRow message={message} viewerUserId={viewerUserId} />;
  }

  if (isTextMessage(message)) {
    if (isProjectAssignmentSubmissionMessage(message)) {
      return wrapForDisplay(
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
      return wrapForDisplay(
        <AttachmentMessageBubble
          message={message}
          isOutgoing={isOutgoing}
          uploadStateByAttachmentId={outgoingUploadStateByAttachmentId}
        />,
      );
    }

    if (hasBody) {
      return wrapForDisplay(<MessageBubble message={message} isOutgoing={isOutgoing} />);
    }

    return null;
  }

  return <SystemMessageRow message={message} viewerUserId={viewerUserId} />;
});