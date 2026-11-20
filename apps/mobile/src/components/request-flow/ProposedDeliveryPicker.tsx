import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  DEFAULT_DELIVERY_DURATION,
  DELIVERY_DURATION_UNITS,
  formatInDurationPreview,
  maxValueForDeliveryUnit,
  type DeliveryDurationUnit,
  validateProposedDeliveryDuration,
} from '@/features/requests/delivery-duration';

type ProposedDeliveryPickerProps = {
  value: number;
  unit: DeliveryDurationUnit;
  onChange: (next: { value: number; unit: DeliveryDurationUnit }) => void;
  error?: string | null;
};

export function defaultProposedDeliveryDuration() {
  return { ...DEFAULT_DELIVERY_DURATION };
}

export function ProposedDeliveryPicker({
  value,
  unit,
  onChange,
  error,
}: ProposedDeliveryPickerProps) {
  const validationMessage = useMemo(
    () => error ?? validateProposedDeliveryDuration(value, unit),
    [error, value, unit],
  );
  const preview = formatInDurationPreview(value, unit);
  const maxValue = maxValueForDeliveryUnit(unit);
  const [amountDraft, setAmountDraft] = useState(() => String(value));

  useEffect(() => {
    setAmountDraft(String(value));
  }, [value, unit]);

  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text className="text-base font-semibold text-ink">How long until delivery?</Text>
      <Text className="text-sm leading-5 text-muted">
        Choose how much time you need after you press Start. The countdown does not begin until then.
      </Text>
      <Text className="text-base font-semibold text-ink">{preview}</Text>
      {validationMessage ? <Text className="text-sm text-warning">{validationMessage}</Text> : null}
      <View className="flex-row items-end gap-3">
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Amount</Text>
          <TextInput
            keyboardType="number-pad"
            className="rounded-xl border border-hairline bg-canvas px-3 py-3 text-base text-ink"
            value={amountDraft}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '');
              setAmountDraft(digits);
              if (digits.length === 0) return;
              const parsed = Number.parseInt(digits, 10);
              if (Number.isNaN(parsed)) return;
              onChange({
                value: Math.min(maxValue, Math.max(1, parsed)),
                unit,
              });
            }}
            onBlur={() => {
              if (amountDraft.length === 0) {
                setAmountDraft(String(value));
                return;
              }
              const parsed = Number.parseInt(amountDraft, 10);
              if (Number.isNaN(parsed) || parsed < 1) {
                setAmountDraft(String(value));
                return;
              }
              const clamped = Math.min(maxValue, Math.max(1, parsed));
              setAmountDraft(String(clamped));
              onChange({ value: clamped, unit });
            }}
          />
        </View>
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Unit</Text>
          <View className="flex-row flex-wrap gap-2">
            {DELIVERY_DURATION_UNITS.map((item) => (
              <Text
                key={item}
                accessibilityRole="button"
                onPress={() => {
                  const nextMax = maxValueForDeliveryUnit(item);
                  onChange({ value: Math.min(value, nextMax), unit: item });
                }}
                className={
                  item === unit
                    ? 'rounded-full bg-active px-3 py-2 text-sm font-semibold text-on-active'
                    : 'rounded-full border border-hairline bg-canvas px-3 py-2 text-sm text-ink'
                }
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            ))}
          </View>
        </View>
      </View>
      <Text className="text-xs text-subtle">Maximum is 30 days. The server validates your choice.</Text>
    </View>
  );
}