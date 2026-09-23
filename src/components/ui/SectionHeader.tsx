import { Pressable, Text, View } from 'react-native';

/** Title for a group of content, with an optional trailing "See all"-style action. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-lg font-bold text-ink">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
        >
          <Text className="text-sm font-semibold text-brand">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
