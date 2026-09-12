import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';
import { colors } from '@/theme';

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  /** Shown as `12 / 1000` under the field. */
  counterMax?: number;
};

export function TextField({ label, hint, error, counterMax, className, ...inputProps }: Props) {
  const length = typeof inputProps.value === 'string' ? inputProps.value.length : 0;

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink">{label}</Text>

      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        className={cn(
          'rounded-2xl border px-4 py-4 text-base text-ink',
          error ? 'border-danger bg-danger-soft' : 'border-hairline bg-surface',
          className,
        )}
        {...inputProps}
      />

      <View className="flex-row justify-between gap-4">
        <Text
          className={cn('flex-1 text-sm', error ? 'text-danger' : 'text-muted')}
          accessibilityRole={error ? 'alert' : undefined}
        >
          {error ?? hint ?? ''}
        </Text>
        {counterMax ? (
          <Text className="text-sm text-muted">
            {length} / {counterMax}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
