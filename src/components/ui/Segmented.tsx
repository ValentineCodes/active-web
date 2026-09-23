import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * The pill-shaped two/three-way switch used to flip between views on the same screen
 * (I Need Help / I Can Help style tabs). One implementation, so every switcher in the app
 * looks and behaves identically.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string; badge?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View className="flex-row rounded-2xl bg-surface p-1">
      {options.map((option) => {
        const selected = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5',
              selected && 'bg-canvas',
            )}
            style={selected ? shadowSm : undefined}
          >
            <Text className={cn('text-sm font-semibold', selected ? 'text-ink' : 'text-muted')}>
              {option.label}
            </Text>
            {option.badge ? (
              <View className="h-5 w-5 items-center justify-center rounded-full bg-brand">
                <Text className="text-xs font-bold text-canvas">{option.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const shadowSm = {
  shadowColor: '#0B1F13',
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
};
