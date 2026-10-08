import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';

type TagPillProps = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function TagPill({ label, selected, disabled, onPress }: TagPillProps) {
  const className = cn(
    'self-start rounded-full border px-4 py-2.5',
    selected ? 'border-active/25 bg-active-soft' : 'border-hairline bg-elevated',
    disabled && !selected && 'opacity-50',
    onPress && 'active:opacity-90',
  );
  const textClassName = cn('text-sm font-medium', selected ? 'text-active' : 'text-ink');

  const content = (
    <Text className={textClassName} numberOfLines={1}>
      {label}
    </Text>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={label} className={className}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={className}
    >
      {content}
    </Pressable>
  );
}
