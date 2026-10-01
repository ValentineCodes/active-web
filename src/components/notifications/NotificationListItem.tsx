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
      className={cn(
        'flex-row gap-3 rounded-3xl p-4 active:opacity-80',
        unread ? 'bg-brandSoft' : 'bg-surface',
      )}
    >
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-2xl',
          visual.iconBackgroundClassName,
        )}
      >
        <Ionicons name={visual.icon} size={22} color={visual.iconColor} />
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-start gap-2">
          <Text
            className={cn(
              'min-w-0 flex-1 text-base text-ink',
              unread ? 'font-bold' : 'font-semibold',
            )}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <View className="flex-row items-center gap-1.5 pt-0.5">
            {unread ? <View className="h-2 w-2 rounded-full bg-active" /> : null}
            <Text className="text-xs text-subtle">{formatInboxRelativeTime(item.receivedAt)}</Text>
          </View>
        </View>
        {item.body ? (
          <Text className="text-sm leading-5 text-muted" numberOfLines={3}>
            {item.body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
