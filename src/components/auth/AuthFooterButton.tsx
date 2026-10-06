import { ActivityIndicator, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

/** Full-width auth CTA with a trailing chevron (matches wizard primary buttons). */
export function AuthFooterButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
}: Props) {
  const colors = useColors();
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      className={cn(
        'min-h-12 flex-row items-center justify-center rounded-2xl px-6 py-4 active:opacity-90',
        inert ? 'bg-surface' : 'bg-brand',
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={inert ? colors.muted : colors.onBrand} />
      ) : (
        <>
          <Text className={cn('text-lg font-semibold', inert ? 'text-muted' : 'text-on-brand')}>
            {label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={inert ? colors.muted : colors.onBrand}
            style={{ marginLeft: 4 }}
          />
        </>
      )}
    </Pressable>
  );
}
