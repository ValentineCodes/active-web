import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';

export function ActivityListRow({
  title,
  subtitle,
  onPress,
  disabled,
  variant = 'default',
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'emphasis';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'gap-1 border-b border-hairline py-3.5',
        variant === 'emphasis' && '-mx-3 mb-1 rounded-xl border border-active/30 bg-active/5 px-3',
        !disabled && 'active:opacity-90',
      )}
    >
      <Text className="text-base font-semibold text-ink" numberOfLines={2}>
        {title}
      </Text>
      <Text className="text-sm text-muted" numberOfLines={2}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

export function ActivitySectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View className="gap-1 pb-2 pt-4">
      <Text className="text-sm font-bold uppercase tracking-wide text-subtle">{title}</Text>
      {description ? <Text className="text-sm text-muted">{description}</Text> : null}
    </View>
  );
}
