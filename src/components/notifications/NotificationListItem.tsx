import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatInboxRelativeTime, notificationVisual } from '@/features/notifications/presentation';
import type { InboxNotification } from '@/features/notifications/types';
import { cn } from '@/lib/cn';

type Props = {
  item: InboxNotification;
  onPress: () => void;
};

export function NotificationListItem({ item, onPress }: Props) {
  const unread = item.readAt === null;
  const visual = notificationVisual(item.type);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      accessibilityState={{ selected: unread }}
      className="flex-row gap-3 py-4 active:opacity-80"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: visual.iconBackground }}
      >
        {visual.useNairaSymbol ? (
          <Text className="text-lg font-bold" style={{ color: visual.iconColor }}>
            ₦
          </Text>
        ) : (
          <Ionicons name={visual.icon} size={22} color={visual.iconColor} />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-1 pr-2">
        <Text className={cn('text-base text-ink', unread ? 'font-bold' : 'font-semibold')}>
          {item.title}
        </Text>
        {item.body ? (
          <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
      </View>

      <View className="w-14 items-end gap-1.5 pt-0.5">
        <Text className="text-xs text-subtle">{formatInboxRelativeTime(item.receivedAt)}</Text>
        {unread ? (
          <View className="h-2 w-2 rounded-full bg-active" />
        ) : (
          <View className="h-2 w-2" />
        )}
      </View>
    </Pressable>
  );
}
