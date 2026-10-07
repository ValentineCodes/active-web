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
  outgoingUploadStateByAttachmentId,
  onRetryOutgoing,
  onDeleteOutgoing,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  outgoingUploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
  onRetryOutgoing?: () => void;
  onDeleteOutgoing?: () => void;
}) {
  if (isSystemMessage(message)) {
    return <SystemMessageRow message={message} />;
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
          onRetry={onRetryOutgoing}
          onDelete={onDeleteOutgoing}
        />
      );
    }

    if (hasBody) {
      return <MessageBubble message={message} isOutgoing={isOutgoing} />;
    }

    return null;
  }

  return <SystemMessageRow message={message} />;
});
