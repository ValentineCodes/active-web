import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme';

/** A small chip naming one service category — "Rides", "Delivery" — with its icon. */
export function ServiceTag({
  label,
  icon,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5">
      {icon ? <Ionicons name={icon} size={14} color={colors.brand} /> : null}
      <Text className="text-sm font-semibold text-brand">{label}</Text>
    </View>
  );
}
