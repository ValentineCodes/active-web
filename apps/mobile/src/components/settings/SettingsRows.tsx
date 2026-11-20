import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '@/theme';

export function SettingsRow({
  label,
  description,
  onPress,
  showDivider,
  trailing,
}: {
  label: string;
  description?: string;
  onPress?: () => void;
  showDivider?: boolean;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  const disabled = !onPress && trailing == null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      className="active:opacity-90"
    >
      {showDivider ? <View className="mx-4 h-px bg-hairline" /> : null}
      <View className="flex-row items-center justify-between gap-3 px-4 py-4">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-lg text-ink">{label}</Text>
          {description ? <Text className="text-sm text-muted">{description}</Text> : null}
        </View>
        {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.subtle} /> : null)}
      </View>
    </Pressable>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</Text>
      <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">{children}</View>
    </View>
  );
}