import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import type { ConversationInboxItem } from '@/features/requests/conversation-inbox-api';
import { formatInboxRelativeTime } from '@/features/notifications/presentation';
import { cn } from '@/lib/cn';
import { useUserId } from '@/features/auth/session';

function previewLine(item: ConversationInboxItem, viewerId: string): string | null {
  if (!item.latestMessageBody) return null;
  const prefix = item.latestMessageSenderId === viewerId ? 'You: ' : '';
  const body =
    item.latestMessageBody.length > 140
      ? `${item.latestMessageBody.slice(0, 137)}…`
      : item.latestMessageBody;
  return `${prefix}${body}`;
}

export function ConversationListItem({
  item,
  onPress,
}: {
  item: ConversationInboxItem;
  onPress: () => void;
}) {
  const userId = useUserId();
  const unread = item.unreadCount > 0;
  const firstName = item.counterpartyDisplayName?.trim().split(/\s+/)[0] ?? 'Chat';
  const preview = previewLine(item, userId);
  const timeLabel = item.latestMessageAt
    ? formatInboxRelativeTime(item.latestMessageAt)
    : formatInboxRelativeTime(item.updatedAt);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        preview
          ? `${firstName}. ${item.requestTitle}. ${preview}`
          : `${firstName}. ${item.requestTitle}`
      }
      accessibilityState={{ selected: unread }}
      className="flex-row gap-3 py-4 active:opacity-80"
    >
      <Avatar
        path={item.counterpartyAvatarPath}
        name={item.counterpartyDisplayName}
        size="sm"
        verified={item.counterpartyIdentityVerified}
      />

      <View className="min-w-0 flex-1 gap-1 pr-2">
        <Text className={cn('text-base text-ink', unread ? 'font-bold' : 'font-semibold')}>
          {firstName}
        </Text>
        <Text className="text-sm text-muted" numberOfLines={1}>
          {item.requestTitle}
        </Text>
        {preview ? (
          <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
      </View>

      <View className="shrink-0 flex-row items-center gap-1.5 self-start pl-1 pt-0.5">
        <Text className="text-xs text-subtle" numberOfLines={1}>
          {timeLabel}
        </Text>
        {unread ? <View className="h-2 w-2 rounded-full bg-active" /> : null}
      </View>
    </Pressable>
  );
}
