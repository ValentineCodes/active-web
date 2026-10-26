import { Text, View } from 'react-native';

import { formatChatDayLabel } from '@/lib/format';

export function ConversationDateSeparator({ iso }: { iso: string }) {
  const label = formatChatDayLabel(iso);
  if (!label) return null;

  return (
    <View className="items-center py-1">
      <View className="rounded-full bg-elevated px-3 py-1">
        <Text className="text-xs font-medium text-muted">{label}</Text>
      </View>
    </View>
  );
}
