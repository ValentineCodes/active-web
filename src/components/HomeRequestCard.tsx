import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SkeletonBlock } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

type HomeRequestCardProps = {
  title: string;
  description: string;
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
  const { colors, shadow } = useTheme();
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
      <Text className="text-xl font-bold leading-7 text-ink" numberOfLines={1}>
        {title}
      </Text>

      {description ? (
        <Text className="text-base leading-6 text-muted" numberOfLines={2}>
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

export function HomeRequestCardSkeleton() {
  const { shadow } = useTheme();
  return (
    <View
      style={shadow.card}
      className="gap-3 rounded-2xl border border-hairline bg-elevated p-4"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SkeletonBlock className="h-7 w-4/5 rounded-md" />
      <SkeletonBlock className="h-12 w-full rounded-md" />
      <View className="flex-row items-center justify-between gap-3 pt-1">
        <SkeletonBlock className="h-4 w-32 rounded-md" />
        <SkeletonBlock className="h-6 w-20 rounded-md" />
      </View>
    </View>
  );
}
