import { Text, View, type TextStyle } from 'react-native';
import { TopTabs } from 'expo-router/js-top-tabs';

import { Screen } from '@/components/ui/Screen';
import { useLiveResponseUpdates } from '@/features/requests/responses-api';
import { useColors } from '@/theme';
import { nativeWindThemeVars } from '@/theme/css-vars';

/** Material top tabs — native bottom tabs cannot nest another NativeTabs layout. */
export default function ActivityLayout() {
  const colors = useColors();
  useLiveResponseUpdates();

  const topTabScreenOptions = {
    tabBarActiveTintColor: colors.active,
    tabBarInactiveTintColor: colors.subtle,
    tabBarIndicatorStyle: { backgroundColor: colors.active, height: 2 },
    tabBarLabelStyle: {
      fontSize: 16,
      fontWeight: '600',
      textTransform: 'none',
    } satisfies TextStyle,
    tabBarStyle: {
      backgroundColor: colors.canvas,
      elevation: 0,
      shadowOpacity: 0,
    },
    // TopTabs defaults to React Navigation theme colors, not our canvas palette.
    sceneStyle: { backgroundColor: colors.canvas },
  };

  return (
    <Screen>
      <View className="min-h-0 flex-1" style={nativeWindThemeVars(colors)}>
        <View className="gap-3 px-5 pt-3">
          <Text className="font-serif text-3xl font-bold text-ink">Activity</Text>
        </View>
        <TopTabs screenOptions={topTabScreenOptions}>
          <TopTabs.Screen name="index" options={{ title: 'My Requests' }} />
          <TopTabs.Screen name="responses" options={{ title: 'My Responses' }} />
        </TopTabs>
      </View>
    </Screen>
  );
}
