import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadow } from '@/theme';

export function RequestExactLocationCard({
  address,
  onDirections,
}: {
  address: string;
  onDirections: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open directions"
      onPress={onDirections}
      style={shadow.card}
      className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated p-4"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-active-soft">
        <Ionicons name="location" size={22} color={colors.active} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Exact location
        </Text>
        <Text className="text-base font-semibold text-ink" numberOfLines={2}>
          {address}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-active">Directions</Text>
    </Pressable>
  );
}
