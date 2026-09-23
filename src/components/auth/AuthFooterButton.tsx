import { ActivityIndicator, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { cn } from '@/lib/cn';
import { colors } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

/** Full-width auth CTA with a trailing chevron, WhatsApp-style. */
export function AuthFooterButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
}: Props) {
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
        'flex-row items-center justify-center rounded-full py-5 active:opacity-90',
        inert ? 'bg-surface' : 'bg-brand',
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.canvas} />
      ) : (
        <>
          <Text className={cn('text-lg font-semibold', inert ? 'text-muted' : 'text-canvas')}>
            {label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={inert ? colors.muted : colors.canvas}
            style={{ marginLeft: 4 }}
          />
        </>
      )}
    </Pressable>
  );
}
