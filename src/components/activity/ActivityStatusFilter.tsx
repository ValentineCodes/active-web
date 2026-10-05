import { Pressable, ScrollView, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { cn } from '@/lib/cn';

type Option<T extends string> = {
  value: T;
  label: string;
};

export function ActivityStatusFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ alignItems: 'center', flexGrow: 0 }}
      contentContainerClassName="gap-2 px-5 pb-3"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Filter by ${option.label}`}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            className={cn(
              'self-start rounded-full px-4 py-2 active:opacity-90',
              selected ? 'bg-elevated' : 'bg-surface',
            )}
          >
            <Text className={cn('text-sm font-semibold', selected ? 'text-ink' : 'text-muted')}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
