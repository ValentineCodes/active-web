import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { colors } from '@/theme';

type Variant = 'primary' | 'active' | 'secondary' | 'ghost' | 'danger';

const containers: Record<Variant, string> = {
  primary: 'bg-ink',
  active: 'bg-active',
  secondary: 'bg-surface border border-hairline',
  ghost: 'bg-transparent',
  danger: 'bg-danger-soft border border-danger',
};

const labelClasses: Record<Variant, string> = {
  primary: 'text-canvas',
  active: 'text-canvas',
  secondary: 'text-ink',
  ghost: 'text-brand',
  danger: 'text-danger',
};

const foregrounds: Record<Variant, string> = {
  primary: colors.canvas,
  active: colors.canvas,
  secondary: colors.ink,
  ghost: colors.brand,
  danger: colors.danger,
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
  const inert = disabled || loading;

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
        'items-center justify-center rounded-2xl active:opacity-80',
        size === 'lg' ? 'px-6 py-5' : 'px-5 py-4',
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
            <Ionicons name={icon} size={size === 'lg' ? 22 : 18} color={foregrounds[variant]} />
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
