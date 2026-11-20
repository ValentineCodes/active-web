import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { HomeTabBar } from '@/components/ui/HomeTabBar';
import { useTrackTabForCreateReturn } from '@/features/navigation/use-track-tab-for-create-return';
import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useNotificationBridge } from '@/lib/notifications';
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

/** JavaScript tabs on web — native tabs have no system tab bar on web. */
export default function TabsLayout() {
  useTrackTabForCreateReturn();
  const colors = useColors();
  const unread = useNotificationUnreadCount();

  useNotificationBridge();

  return (
    <Tabs
      tabBar={(props) => <HomeTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.subtle,
        tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#FFFFFF' },
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
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: (props) => <TabIcon {...props} name="search-outline" />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          href: null,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: (props) => <TabIcon {...props} name="notifications-outline" />,
          tabBarBadge: unread.data && unread.data > 0 ? unread.data : undefined,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: null,
        }}
      />
    </Tabs>
  );
}