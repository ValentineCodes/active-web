import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '@/theme';

export function CheckboxRow({
  label,
  checked,
  onChange,
  accessibilityLabel,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => onChange(!checked)}
      className="flex-row items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 active:opacity-90"
    >
      <Text className="flex-1 text-base font-semibold text-ink">{label}</Text>
      <View
        className={`h-5 w-5 items-center justify-center rounded border ${
          checked ? 'border-active bg-active' : 'border-hairline bg-elevated'
        }`}
      >
        {checked ? <Ionicons name="checkmark" size={14} color={colors.elevated} /> : null}
      </View>
    </Pressable>
  );
}