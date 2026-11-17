'use client';

import { SharedLocationMessageBubble } from '@/components/conversation/SharedLocationMessageBubble';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import { parseSharedLocationMessageBody } from '@/features/requests/conversation-shared-location';
import { cn } from '@/lib/cn';

export function MessageBubble({
  message,
  isOutgoing,
}: {
  message: Pick<RequestMessage, 'body'>;
  isOutgoing: boolean;
}) {
  const sharedLocation = parseSharedLocationMessageBody(message.body);
  if (sharedLocation) {
    return <SharedLocationMessageBubble position={sharedLocation} isOutgoing={isOutgoing} />;
  }

  return (
    <div className={cn('max-w-[85%]', isOutgoing ? 'self-end' : 'self-start')}>
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5',
          isOutgoing ? 'rounded-br-md bg-active' : 'rounded-bl-md border border-hairline bg-elevated',
        )}
      >
        {message.body ? (
          <p className={cn('text-base leading-6', isOutgoing ? 'text-on-brand' : 'text-ink')}>{message.body}</p>
        ) : null}
      </div>
    </div>
  );
}
