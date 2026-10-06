import { Ionicons } from '@expo/vector-icons';
import { NativeTabs } from 'expo-router/native-tabs';

import { useConversationInboxUnreadCount } from '@/features/requests/conversation-inbox-api';
import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useNotificationBridge } from '@/lib/notifications';
import { useMyRequests } from '@/features/requests/requester-api';
import { useColors } from '@/theme';

const VectorIcon = NativeTabs.Trigger.VectorIcon;

export default function TabsLayout() {
  const colors = useColors();
  const { data: requests } = useMyRequests();
  const unreadNotifications = useNotificationUnreadCount();
  const unreadMessages = useConversationInboxUnreadCount();
  const unreadCount = unreadNotifications.data ?? 0;
  const messageUnreadCount = unreadMessages.data ?? 0;

  useNotificationBridge();

  const waitingResponses =
    requests?.reduce(
      (total, request) =>
        request.status === 'posted' || request.status === 'searching'
          ? total + request.pending_response_count
          : total,
      0,
    ) ?? 0;

  const activityBadge = waitingResponses > 0 ? String(waitingResponses) : null;
  const messagesBadge = messageUnreadCount > 0 ? String(messageUnreadCount) : null;
  const notificationBadge = unreadCount > 0 ? String(unreadCount) : null;

  return (
    <NativeTabs tintColor={colors.active} labelVisibilityMode="unlabeled">
      <NativeTabs.Trigger name="index" accessibilityLabel="Home">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          src={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity" accessibilityLabel="Activity">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet', selected: 'list.bullet' }}
          src={<VectorIcon family={Ionicons} name="list-outline" />}
        />
        {activityBadge ? (
          <NativeTabs.Trigger.Badge>{activityBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages" accessibilityLabel="Messages">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'message', selected: 'message.fill' }}
          src={{
            default: <VectorIcon family={Ionicons} name="chatbubbles-outline" />,
            selected: <VectorIcon family={Ionicons} name="chatbubbles" />,
          }}
        />
        {messagesBadge ? (
          <NativeTabs.Trigger.Badge>{messagesBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications" accessibilityLabel="Notifications">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          src={{
            default: <VectorIcon family={Ionicons} name="notifications-outline" />,
            selected: <VectorIcon family={Ionicons} name="notifications" />,
          }}
        />
        {notificationBadge ? (
          <NativeTabs.Trigger.Badge>{notificationBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
