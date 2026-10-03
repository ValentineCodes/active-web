import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';

type TabConfig = {
  routeName: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TABS: TabConfig[] = [
  { routeName: 'index', label: 'Home', icon: 'home-outline' },
  { routeName: 'activity', label: 'Activity', icon: 'list-outline' },
  { routeName: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
];

type HomeTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function HomeTabBar({ state, descriptors, navigation }: HomeTabBarProps) {
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
      <View className="flex-row px-2 pt-2">
        {TABS.map((tab) => {
          const routeIndex = state.routes.findIndex((route) => route.name === tab.routeName);
          const route = state.routes[routeIndex];
          if (!route) return null;

          const descriptor = descriptors[route.key];
          if (!descriptor) return null;

          const { options } = descriptor;
          const focused = state.index === routeIndex;
          const color = focused ? colors.active : colors.subtle;
          const badge = options.tabBarBadge;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={tab.routeName}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? tab.label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              className="min-h-12 flex-1 items-center justify-center gap-0.5 py-1"
            >
              <View>
                <Ionicons name={tab.icon} size={24} color={color} />
                {typeof badge === 'number' || typeof badge === 'string' ? (
                  <View className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1">
                    <Text className="text-center text-[10px] font-bold text-white">
                      {String(badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-xs font-semibold" style={{ color }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
