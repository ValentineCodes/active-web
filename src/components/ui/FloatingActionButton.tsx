import { Platform, Pressable, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

/** Height of the floating native tab pill above the home indicator (iOS). */
const IOS_FLOATING_TAB_BAR_HEIGHT = 28;

/**
 * `bottom` offset for a FAB on tab screens. iOS native tabs draw edge-to-edge; Android
 * insets screen content above the bar; web JS tabs keep the bar outside the screen area.
 */
export function useFabBottomOffset(gap = 0) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'ios') {
    return insets.bottom + IOS_FLOATING_TAB_BAR_HEIGHT + gap;
  }

  return gap;
}

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
