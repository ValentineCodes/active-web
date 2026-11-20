import { ActivityIndicator, Text, View } from 'react-native';

import { useColors } from '@/theme';

/** Footer for infinite scroll / load-more (not a full-screen spinner). */
export function ListFooterLoading({ label = 'Loading more…' }: { label?: string }) {
  const colors = useColors();
  return (
    <View className="items-center gap-2 py-4" accessibilityRole="progressbar">
      <ActivityIndicator color={colors.brand} />
      <Text className="text-xs text-muted">{label}</Text>
    </View>
  );
}

export function ListEndMarker({ message = 'End of list' }: { message?: string }) {
  return (
    <View className="items-center py-4">
      <Text className="text-xs text-subtle">{message}</Text>
    </View>
  );
}