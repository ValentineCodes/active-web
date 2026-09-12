import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { colors } from '@/theme';

/**
 * A selectable row used wherever the product asks "which one?" — service category,
 * radius, availability duration. Works for single and multi select; the caller owns the
 * selection state.
 */
export function Choice({
  title,
  subtitle,
  icon,
  selected,
  onPress,
  multiple = false,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  multiple?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-2xl border p-4 active:opacity-80',
        selected ? 'border-brand bg-brand-soft' : 'border-hairline bg-canvas',
      )}
    >
      {icon ? (
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-xl',
            selected ? 'bg-canvas' : 'bg-surface',
          )}
        >
          <Ionicons name={icon} size={20} color={selected ? colors.brand : colors.muted} />
        </View>
      ) : null}

      <View className="flex-1">
        <Text className={cn('text-base font-semibold', selected ? 'text-brand' : 'text-ink')}>
          {title}
        </Text>
        {subtitle ? <Text className="text-sm text-muted">{subtitle}</Text> : null}
      </View>

      <Ionicons
        name={
          multiple
            ? selected
              ? 'checkbox'
              : 'square-outline'
            : selected
              ? 'radio-button-on'
              : 'radio-button-off'
        }
        size={22}
        color={selected ? colors.brand : colors.hairline}
      />
    </Pressable>
  );
}
