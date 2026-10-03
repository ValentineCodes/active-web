import { NativeTabs } from 'expo-router/native-tabs';

import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useNotificationBridge } from '@/lib/notifications';
import { useMyRequests } from '@/features/requests/requester-api';
import { useColors } from '@/theme';

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
          md={{ default: 'home', selected: 'home' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet', selected: 'list.bullet' }}
          md={{ default: 'format_list_bulleted', selected: 'format_list_bulleted' }}
        />
        {activityBadge ? (
          <NativeTabs.Trigger.Badge>{activityBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          md={{ default: 'notifications', selected: 'notifications' }}
        />
        {notificationBadge ? (
          <NativeTabs.Trigger.Badge>{notificationBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
