import { Pressable, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { colors, shadow } from '@/theme';

export function FloatingActionButton({
  onPress,
  accessibilityLabel,
  icon = 'add',
  className,
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: keyof typeof Ionicons.glyphMap;
  className?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[shadow.raised, style]}
      className={cn(
        'h-14 w-14 items-center justify-center rounded-full bg-brand active:opacity-90',
        className,
      )}
    >
      <Ionicons name={icon} size={28} color={colors.canvas} />
    </Pressable>
  );
}
