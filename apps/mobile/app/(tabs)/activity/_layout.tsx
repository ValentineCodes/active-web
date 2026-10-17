import { Text, View } from 'react-native';
import { TopTabs } from 'expo-router/js-top-tabs';

import { useActivityTopTabScreenOptions } from '@/components/activity/useActivityTopTabScreenOptions';
import { Screen } from '@/components/ui/Screen';
import { useLiveResponseUpdates } from '@/features/requests/responses-api';
import { nativeWindThemeVars } from '@/theme/css-vars';
import { useColors } from '@/theme';

/** Material top tabs — native bottom tabs cannot nest another NativeTabs layout. */
export default function ActivityLayout() {
  const colors = useColors();
  const topTabScreenOptions = useActivityTopTabScreenOptions();
  useLiveResponseUpdates();

  return (
    <Screen>
      <View className="min-h-0 flex-1" style={nativeWindThemeVars(colors)}>
        <View className="px-5 pb-1 pt-3">
          <Text className="text-3xl font-bold text-ink">Activity</Text>
        </View>
        <TopTabs screenOptions={topTabScreenOptions}>
          <TopTabs.Screen name="index" options={{ title: 'My Requests' }} />
          <TopTabs.Screen name="responses" options={{ title: 'My Responses' }} />
        </TopTabs>
      </View>
    </Screen>
  );
}
