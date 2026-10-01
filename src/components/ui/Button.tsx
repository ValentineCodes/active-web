import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type Variant = 'primary' | 'active' | 'secondary' | 'ghost' | 'danger';

const containers: Record<Variant, string> = {
  primary: 'bg-brand',
  active: 'bg-active',
  secondary: 'bg-surface',
  ghost: 'bg-transparent',
  danger: 'bg-danger-soft',
};

const labelClasses: Record<Variant, string> = {
  primary: 'text-on-brand',
  active: 'text-on-brand',
  secondary: 'text-ink',
  ghost: 'text-brand',
  danger: 'text-danger',
};

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  loading = false,
  disabled = false,
  className,
}: Props) {
  const colors = useColors();
  const inert = disabled || loading;

  const foregrounds: Record<Variant, string> = {
    primary: colors.onBrand,
    active: colors.onBrand,
    secondary: colors.ink,
    ghost: colors.brand,
    danger: colors.danger,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      className={cn(
        'items-center justify-center rounded-full active:opacity-80',
        size === 'lg' ? 'px-6 py-4' : 'px-5 py-3.5',
        containers[variant],
        inert && 'opacity-40',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foregrounds[variant]} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? (
            <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={foregrounds[variant]} />
          ) : null}
          <Text
            className={cn(
              'font-semibold',
              size === 'lg' ? 'text-lg' : 'text-base',
              labelClasses[variant],
            )}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
