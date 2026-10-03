import { Animated, Text } from 'react-native';
import type { MaterialTopTabNavigationOptions } from 'expo-router/build/react-navigation/material-top-tabs/types';

import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type TabBarIndicatorProps = Parameters<
  NonNullable<MaterialTopTabNavigationOptions['tabBarIndicator']>
>[0];

const INDICATOR_WIDTH = 28;

function ActivityTabBarIndicator({
  state,
  position,
  getTabWidth,
  layout,
  gap = 0,
  color,
}: TabBarIndicatorProps & { color: string }) {
  const routes = state.routes;
  const tabCount = routes.length;

  if (!layout.width || tabCount === 0) {
    return null;
  }

  const widths = routes.map((_, index) => getTabWidth(index));
  if (widths.some((width) => width <= 0)) {
    return null;
  }

  const totalTabsWidth =
    widths.reduce((sum, width) => sum + width, 0) + (tabCount > 1 ? gap * (tabCount - 1) : 0);
  const leadingOffset = Math.max(0, (layout.width - totalTabsWidth) / 2);

  const outputRange = routes.map((_, index) => {
    let offset = leadingOffset;
    for (let j = 0; j < index; j++) {
      offset += widths[j]! + gap;
    }
    return offset + widths[index]! / 2 - INDICATOR_WIDTH / 2;
  });

  const translateX =
    tabCount > 1
      ? position.interpolate({
          inputRange: routes.map((_, index) => index),
          outputRange,
          extrapolate: 'clamp',
        })
      : outputRange[0];

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        height: 2,
        width: INDICATOR_WIDTH,
        borderRadius: 999,
        backgroundColor: color,
        transform: [{ translateX }],
      }}
    />
  );
}

export function useActivityTopTabScreenOptions(): MaterialTopTabNavigationOptions {
  const colors = useColors();

  return {
    tabBarActiveTintColor: colors.ink,
    tabBarInactiveTintColor: colors.subtle,
    tabBarPressColor: 'transparent',
    tabBarPressOpacity: 0.65,
    tabBarAndroidRipple: { color: 'transparent' },
    tabBarScrollEnabled: false,
    tabBarGap: 28,
    tabBarItemStyle: { width: 'auto' as const, paddingHorizontal: 12 },
    tabBarContentContainerStyle: { justifyContent: 'center' as const },
    tabBarStyle: {
      backgroundColor: colors.canvas,
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
    },
    sceneStyle: { backgroundColor: colors.canvas },
    tabBarLabel: ({ focused, children }: { focused: boolean; children: string }) => (
      <Text
        className={cn('text-base', focused ? 'font-bold text-ink' : 'font-semibold text-subtle')}
        style={focused ? undefined : { opacity: 0.55 }}
      >
        {children}
      </Text>
    ),
    tabBarIndicator: (props: TabBarIndicatorProps) => (
      <ActivityTabBarIndicator {...props} color={colors.ink} />
    ),
  };
}
