import { Pressable, Text } from 'react-native';
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
      accessibilityLabel={`Active now: ${title}`}
      onPress={onPress}
      style={shadow.raised}
      className="mx-5 flex-row items-center gap-2.5 rounded-2xl bg-active px-4 py-3 active:opacity-90"
    >
      <Ionicons name="radio-outline" size={18} color={colors.onBrand} />
      <Text className="min-w-0 flex-1 text-sm font-semibold text-on-brand" numberOfLines={1}>
        Active now · {title}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.onBrand} />
    </Pressable>
  );
}
