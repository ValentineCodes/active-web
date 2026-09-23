import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { colors } from '@/theme';

type Variant = 'ghost' | 'surface' | 'brand';

const containers: Record<Variant, string> = {
  ghost: 'bg-transparent',
  surface: 'bg-surface',
  brand: 'bg-brand-soft',
};

const foregrounds: Record<Variant, string> = {
  ghost: colors.ink,
  surface: colors.ink,
  brand: colors.brand,
};

/** A round icon-only tap target — header back/close buttons, quick call/message actions. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'ghost',
  size = 40,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: Variant;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ height: size, width: size, borderRadius: size / 2 }}
      className={cn('items-center justify-center active:opacity-70', containers[variant])}
    >
      <Ionicons name={icon} size={Math.round(size * 0.55)} color={foregrounds[variant]} />
    </Pressable>
  );
}
