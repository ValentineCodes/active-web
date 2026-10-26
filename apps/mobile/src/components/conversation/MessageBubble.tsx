import { Text, View } from 'react-native';

import type { RequestMessage } from '@/features/requests/conversation-message-model';
import { cn } from '@/lib/cn';

export function MessageBubble({
  message,
  isOutgoing,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
}) {
  return (
    <View className={cn('max-w-[85%]', isOutgoing ? 'self-end' : 'self-start')}>
      <View
        className={cn(
          'rounded-2xl px-4 py-2.5',
          isOutgoing
            ? 'rounded-br-md bg-active'
            : 'rounded-bl-md border border-hairline bg-elevated',
        )}
      >
        <Text
          selectable
          className={cn('text-base leading-6', isOutgoing ? 'text-on-brand' : 'text-ink')}
        >
          {message.body}
        </Text>
      </View>
    </View>
  );
}
