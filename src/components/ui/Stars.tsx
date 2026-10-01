import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme';

const VALUES = [1, 2, 3, 4, 5] as const;

export function StarRating({ average, count }: { average: number | null; count: number }) {
  if (count === 0 || average === null) {
    return <Text className="text-sm text-muted">No ratings yet</Text>;
  }

  return (
    <View
      className="flex-row items-center gap-1"
      accessibilityLabel={`Rated ${average.toFixed(1)} out of 5 from ${count} ratings`}
    >
      <Ionicons name="star" size={14} color={colors.warning} />
      <Text className="text-sm font-semibold text-ink">{average.toFixed(1)}</Text>
    </View>
  );
}

export function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (stars: number) => void;
}) {
  return (
    <View className="flex-row justify-center gap-3" accessibilityRole="radiogroup">
      {VALUES.map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === star }}
          accessibilityLabel={`${star} ${star === 1 ? 'star' : 'stars'}`}
          hitSlop={8}
        >
          <Ionicons
            name={value !== null && star <= value ? 'star' : 'star-outline'}
            size={40}
            color={value !== null && star <= value ? colors.warning : colors.hairline}
          />
        </Pressable>
      ))}
    </View>
  );
}
