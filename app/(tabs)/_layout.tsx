import { Ionicons } from '@expo/vector-icons';
import { NativeTabs } from 'expo-router/native-tabs';

import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useNotificationBridge } from '@/lib/notifications';
import { useMyRequests } from '@/features/requests/requester-api';
import { useColors } from '@/theme';

const VectorIcon = NativeTabs.Trigger.VectorIcon;

export default function TabsLayout() {
  const colors = useColors();
  const { data: requests } = useMyRequests();
  const unreadNotifications = useNotificationUnreadCount();
  const unreadCount = unreadNotifications.data ?? 0;

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
  const notificationBadge = unreadCount > 0 ? String(unreadCount) : null;

  return (
    <NativeTabs tintColor={colors.active}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          src={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet', selected: 'list.bullet' }}
          src={<VectorIcon family={Ionicons} name="list-outline" />}
        />
        {activityBadge ? (
          <NativeTabs.Trigger.Badge>{activityBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
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
