import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '@/theme';

export function HomeActiveRequestBanner({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Active now: ${title}`}
      onPress={onPress}
      className="mx-5 flex-row items-center gap-2.5 rounded-2xl bg-active px-3.5 py-2 active:opacity-90"
    >
      <View className="h-7 w-7 items-center justify-center rounded-full bg-on-brand/15">
        <View className="h-2 w-2 rounded-full bg-on-brand" />
      </View>
      <Text className="min-w-0 flex-1 text-xs font-semibold text-on-brand" numberOfLines={1}>
        Active now · {title}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.onBrand} />
    </Pressable>
  );
}