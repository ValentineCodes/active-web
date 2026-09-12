import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useNotificationBridge } from '@/lib/notifications';
import { useMyRequests } from '@/features/requests/requester-api';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { data: requests } = useMyRequests();

  useNotificationBridge();

  const waitingResponses =
    requests?.reduce(
      (total, request) =>
        request.status === 'searching' ? total + request.pending_response_count : total,
      0,
    ) ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.hairline, backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarBadge: waitingResponses > 0 ? waitingResponses : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
