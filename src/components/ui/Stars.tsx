import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

const VALUES = [1, 2, 3, 4, 5] as const;

type StarRatingSize = 'sm' | 'md';

const STAR_SIZE: Record<StarRatingSize, number> = {
  sm: 14,
  md: 16,
};

/** Average rating chip — amber star + score (matches requester row on the respond screen). */
export function StarRating({
  average,
  count,
  size = 'sm',
}: {
  average: number | null;
  count: number;
  size?: StarRatingSize;
}) {
  const colors = useColors();
  const ratingColor = colors.warning;

  if (count === 0 || average === null) {
    return <Text className="text-sm text-muted">No ratings yet</Text>;
  }

  const starSize = STAR_SIZE[size];

  return (
    <View
      className="flex-row items-center gap-1"
      accessibilityLabel={`Rated ${average.toFixed(1)} out of 5 from ${count} ratings`}
    >
      <Ionicons name="star" size={starSize} color={ratingColor} />
      <Text
        className={cn(
          'font-semibold',
          size === 'md' ? 'text-base' : 'text-sm',
        )}
        style={{ color: ratingColor }}
      >
        {average.toFixed(1)}
      </Text>
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
  const colors = useColors();
  const ratingColor = colors.warning;
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
            color={value !== null && star <= value ? ratingColor : colors.hairline}
          />
        </Pressable>
      ))}
    </View>
  );
}
