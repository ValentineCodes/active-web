import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { colors, shadow } from '@/theme';

type HomeRequestCardProps = {
  title: string;
  description?: string | null;
  amount: string;
  whenLine: string;
  proximity: string;
  onPress: () => void;
  disabled?: boolean;
};

/** Home feed tile — serif title, preview, proximity, when, and offer (matches home mock). */
export function HomeRequestCard({
  title,
  description,
  amount,
  whenLine,
  proximity,
  onPress,
  disabled = false,
}: HomeRequestCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={shadow.card}
      className={cn(
        'gap-3 rounded-2xl border border-hairline bg-elevated p-4',
        !disabled && 'active:opacity-90',
      )}
    >
      <Text className="font-serif text-xl font-bold leading-7 text-ink" numberOfLines={1}>
        {title}
      </Text>

      {description ? (
        <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
          {description}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between gap-3 pt-1">
        <View className="flex-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <View className="flex-row items-center gap-1">
            <Ionicons name="location-outline" size={14} color={colors.subtle} />
            <Text className="text-sm text-muted">{proximity}</Text>
          </View>
          <Text className="text-sm text-muted">{whenLine}</Text>
        </View>
        <Text className="text-lg font-bold text-active" numberOfLines={1}>
          {amount}
        </Text>
      </View>
    </Pressable>
  );
}
