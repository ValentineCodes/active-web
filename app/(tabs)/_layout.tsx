import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { HomeTabBar } from '@/components/ui/HomeTabBar';
import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useNotificationBridge } from '@/lib/notifications';
import { useMyRequests } from '@/features/requests/requester-api';
import { useColors } from '@/theme';

function TabIcon({
  color,
  size,
  name,
}: {
  color: ColorValue;
  size: number;
  name: keyof typeof Ionicons.glyphMap;
}) {
  return <Ionicons name={name} size={size} color={color as string} />;
}

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

  return (
    <Tabs
      tabBar={(props) => <HomeTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.subtle,
        tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#FFFFFF' },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: (props) => <TabIcon {...props} name="home-outline" />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarBadge: waitingResponses > 0 ? waitingResponses : undefined,
          tabBarIcon: (props) => <TabIcon {...props} name="list-outline" />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: (props) => <TabIcon {...props} name="notifications-outline" />,
        }}
      />
    </Tabs>
  );
}
