'use client';

import { memo } from 'react';

import { AttachmentMessageBubble } from '@/components/conversation/AttachmentMessageBubble';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { SystemMessageRow } from '@/components/conversation/SystemMessageRow';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import {
  isSystemMessage,
  isTextMessage,
  messageHasAttachments,
} from '@/features/requests/conversation-message-model';

export const ConversationMessageItem = memo(function ConversationMessageItem({
  message,
  isOutgoing,
  viewerUserId,
  outgoingUploadStateByAttachmentId,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  viewerUserId?: string | null;
  outgoingUploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
}) {
  if (isSystemMessage(message)) {
    return <SystemMessageRow message={message} viewerUserId={viewerUserId} />;
  }

  if (isTextMessage(message)) {
    const hasBody = message.body.trim().length > 0;
    const hasAttachments = messageHasAttachments(message);

    if (!hasBody && !hasAttachments) {
      return null;
    }

    if (hasAttachments) {
      return (
        <AttachmentMessageBubble
          message={message}
          isOutgoing={isOutgoing}
          uploadStateByAttachmentId={outgoingUploadStateByAttachmentId}
        />
      );
    }

    if (hasBody) {
      return <MessageBubble message={message} isOutgoing={isOutgoing} />;
    }

    return null;
  }

  return <SystemMessageRow message={message} viewerUserId={viewerUserId} />;
});