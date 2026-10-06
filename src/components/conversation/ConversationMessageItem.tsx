import { memo } from 'react';

import { MessageBubble } from '@/components/conversation/MessageBubble';
import { SystemMessageRow } from '@/components/conversation/SystemMessageRow';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import { isSystemMessage, isTextMessage } from '@/features/requests/conversation-message-model';

export const ConversationMessageItem = memo(function ConversationMessageItem({
  message,
  isOutgoing,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
}) {
  if (isTextMessage(message)) {
    return <MessageBubble message={message} isOutgoing={isOutgoing} />;
  }

  if (isSystemMessage(message)) {
    return <SystemMessageRow message={message} />;
  }

  return <SystemMessageRow message={message} />;
});
