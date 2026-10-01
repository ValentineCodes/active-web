import { Pressable, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

export function FloatingActionButton({
  onPress,
  accessibilityLabel,
  icon = 'add',
  variant = 'brand',
  className,
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** `create` — bright green with a white plus (home FAB). */
  variant?: 'brand' | 'create';
  className?: string;
  style?: ViewStyle;
}) {
  const { colors, shadow } = useTheme();
  const isCreate = variant === 'create';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[shadow.raised, style]}
      className={cn(
        'h-14 w-14 items-center justify-center rounded-full active:opacity-90',
        isCreate ? 'bg-active' : 'bg-brand',
        className,
      )}
    >
      <Ionicons name={icon} size={28} color={colors.onBrand} />
    </Pressable>
  );
}
