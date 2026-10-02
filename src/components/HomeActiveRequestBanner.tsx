import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';

export function HomeActiveRequestBanner({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const { colors, shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Active request: ${title}`}
      onPress={onPress}
      style={shadow.raised}
      className="flex-row items-center gap-3 rounded-2xl bg-active p-4 active:opacity-90"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-on-brand/15">
        <View className="h-2.5 w-2.5 rounded-full bg-on-brand" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-xs font-bold uppercase tracking-widest text-on-brand">
          Active request
        </Text>
        <Text className="font-serif text-lg font-bold leading-6 text-on-brand" numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onBrand} />
    </Pressable>
  );
}
