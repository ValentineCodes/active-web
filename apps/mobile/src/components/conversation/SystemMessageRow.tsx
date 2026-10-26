import { Text, View } from 'react-native';

import type { RequestMessage } from '@/features/requests/conversation-message-model';

export function SystemMessageRow({ message }: { message: RequestMessage }) {
  return (
    <View className="items-center px-4">
      <Text className="text-center text-sm text-muted">{message.body}</Text>
    </View>
  );
}
