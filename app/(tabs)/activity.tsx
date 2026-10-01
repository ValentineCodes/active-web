import { Text, View } from 'react-native';

import { ActivityTabView } from '@/components/activity/ActivityTabView';
import { Screen } from '@/components/ui/Screen';
import { useLiveResponseUpdates } from '@/features/requests/responses-api';

export default function ActivityScreen() {
  useLiveResponseUpdates();

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-5 pt-3">
          <Text className="font-serif text-3xl font-bold text-ink">Activity</Text>
        </View>
        <View className="min-h-0 flex-1">
          <ActivityTabView />
        </View>
      </View>
    </Screen>
  );
}
