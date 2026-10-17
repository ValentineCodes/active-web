import { Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme';

/** Prototype hero — community activity headline for the home scroll experience. */
export function HomeCommunityHero() {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  // Fill the first screen below the fixed greeting row so the CTA can sit in the middle.
  const minHeight = Math.max(windowHeight - 200, 320);

  return (
    <View className="pb-4 pt-1" style={{ minHeight }}>
      <View className="mt-8">
      <Text className="text-2xl font-bold leading-8 text-active">nearby</Text>
        <Text className="pt-0.5 text-6xl font-bold leading-tight text-ink">100,000</Text>
        <Text className="text-2xl font-bold leading-8 text-ink">people are active</Text>
        <Text className="max-w-sm text-base leading-6 text-muted mt-4">
          What do you need help with?
        </Text>
      </View>

      <View className="flex-1 -mt-20">
        <View className="flex-1 items-center justify-end">
          <Button
            label="Make a request"
            variant="active"
            size="lg"
            onPress={() => router.push('/request/new')}
          />
        </View>
        <View className="flex-1 items-center justify-start -bottom-32">
          <View className="items-center gap-1.5">
            <Ionicons name="chevron-down" size={22} color={colors.subtle} />
            <Text className="text-lg text-muted">Swipe to explore</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
