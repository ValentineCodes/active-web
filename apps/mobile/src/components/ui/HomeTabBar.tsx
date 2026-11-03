import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';

type TabConfig = {
  routeName: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const LEFT_TABS: TabConfig[] = [
  { routeName: 'index', label: 'Home', icon: 'home-outline' },
  { routeName: 'activity', label: 'Activity', icon: 'list-outline' },
];

const RIGHT_TABS: TabConfig[] = [
  { routeName: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
];

type HomeTabBarProps = Pick<
  Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0],
  'state' | 'descriptors'
>;

function CreateTabButton() {
  const { colors, shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create request"
      onPress={() => router.push('/request/new')}
      style={[
        shadow.raised,
        {
          height: 44,
          width: 44,
          marginHorizontal: 4,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: colors.active,
        },
      ]}
      className="active:opacity-90"
    >
      <Ionicons name="add" size={28} color={colors.ink} />
    </Pressable>
  );
}

function TabBarItem({
  tab,
  state,
  descriptors,
}: {
  tab: TabConfig;
  state: HomeTabBarProps['state'];
  descriptors: HomeTabBarProps['descriptors'];
}) {
  const { colors } = useTheme();
  const routeIndex = state.routes.findIndex((route) => route.name === tab.routeName);
  const route = state.routes[routeIndex];
  if (!route) return null;

  const descriptor = descriptors[route.key];
  if (!descriptor) return null;

  const { navigation, options } = descriptor;
  const focused = state.index === routeIndex;
  const color = focused ? colors.active : colors.subtle;
  const badge = options.tabBarBadge;

  const onPress = () => {
    if (!focused) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={options.tabBarAccessibilityLabel ?? tab.label}
      onPress={onPress}
      onLongPress={() => navigation.navigate(route.name, route.params)}
      className="min-h-11 flex-1 items-center justify-center py-1"
    >
      <View>
        <Ionicons name={tab.icon} size={24} color={color} />
        {typeof badge === 'number' || typeof badge === 'string' ? (
          <View className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1">
            <Text className="text-center text-[10px] font-bold text-white">{String(badge)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function HomeTabBar({ state, descriptors }: HomeTabBarProps) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, 8);

  return (
    <View
      style={[
        shadow.raised,
        {
          backgroundColor: colors.canvas,
          borderTopWidth: 1,
          borderTopColor: colors.hairline,
          paddingBottom,
        },
      ]}
    >
      <View className="flex-row items-center px-2 pt-2">
        {LEFT_TABS.map((tab) => (
          <TabBarItem key={tab.routeName} tab={tab} state={state} descriptors={descriptors} />
        ))}
        <View className="min-h-11 flex-1 items-center justify-center py-1">
          <CreateTabButton />
        </View>
        {RIGHT_TABS.map((tab) => (
          <TabBarItem key={tab.routeName} tab={tab} state={state} descriptors={descriptors} />
        ))}
      </View>
    </View>
  );
}
