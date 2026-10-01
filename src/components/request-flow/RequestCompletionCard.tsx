import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadow } from '@/theme';

export function RequestCompletionCard({
  completedAtLabel,
  ratingStars,
}: {
  completedAtLabel: string;
  ratingStars?: number | null;
}) {
  return (
    <View
      style={shadow.card}
      className="items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-6"
    >
      <Text className="text-lg font-bold text-brand">Request complete</Text>
      <Text className="text-sm text-muted">{completedAtLabel}</Text>
      {ratingStars ? (
        <View className="flex-row gap-1">
          {Array.from({ length: 5 }, (_, index) => (
            <Ionicons
              key={index}
              name={index < ratingStars ? 'star' : 'star-outline'}
              size={22}
              color={colors.warning}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
