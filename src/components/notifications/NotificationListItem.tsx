import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import { formatInboxRelativeTime, notificationVisual } from '@/features/notifications/presentation';
import type { InboxNotification } from '@/features/notifications/types';
import { cn } from '@/lib/cn';
import { formatNotificationCopy } from '@/lib/format';

type Props = {
  item: InboxNotification;
  onPress: () => void;
};

export function NotificationListItem({ item, onPress }: Props) {
  const unread = item.readAt === null;
  const visual = notificationVisual(item.type);
  const title = formatNotificationCopy(item.title);
  const body = item.body ? formatNotificationCopy(item.body) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      accessibilityState={{ selected: unread }}
      className="flex-row gap-3 py-4 active:opacity-80"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: visual.iconBackground }}
      >
        {visual.useNairaSymbol ? (
          <Text className="text-lg font-bold" style={{ color: visual.iconColor }}>
            {MARKET.currencySymbol}
          </Text>
        ) : (
          <Ionicons name={visual.icon} size={22} color={visual.iconColor} />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-1 pr-2">
        <Text className={cn('text-base text-ink', unread ? 'font-bold' : 'font-semibold')}>
          {title}
        </Text>
        {body ? (
          <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>

      <View className="shrink-0 flex-row items-center gap-1.5 self-start pl-1 pt-0.5">
        <Text className="text-xs text-subtle" numberOfLines={1}>
          {formatInboxRelativeTime(item.receivedAt)}
        </Text>
        {unread ? <View className="h-2 w-2 rounded-full bg-active" /> : null}
      </View>
    </Pressable>
  );
}

export function NotificationListItemSkeleton() {
  return (
    <View
      className="flex-row gap-3 py-4"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SkeletonBlock className="h-11 w-11 rounded-full" />
      <View className="min-w-0 flex-1 gap-2 pr-2">
        <SkeletonBlock className="h-4 w-4/5 rounded-md" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
      </View>
      <SkeletonBlock className="h-3 w-10 rounded-md" />
    </View>
  );
}
