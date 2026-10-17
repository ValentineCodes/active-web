import { Text, View } from 'react-native';

import type { RequestMessage } from '@/features/requests/conversation-message-model';
import { formatChatMessageTime } from '@/lib/format';

export function SystemMessageRow({ message }: { message: RequestMessage }) {
  return (
    <View className="items-center gap-1 px-4">
      <Text className="text-center text-sm text-muted">{message.body}</Text>
      <Text className="text-xs text-muted">{formatChatMessageTime(message.createdAt)}</Text>
    </View>
  );
}
