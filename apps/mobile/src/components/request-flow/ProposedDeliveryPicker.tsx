import { useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { addDays } from 'date-fns';

import { Button } from '@/components/ui/Button';
import {
  DEFAULT_PROPOSED_DELIVERY_TIMEZONE,
  formatDeliveryInstantLabel,
  validateProposedDeliveryAt,
} from '@/features/requests/engagement-lifecycle';

type ProposedDeliveryPickerProps = {
  value: Date;
  onChange: (next: Date) => void;
  timezone?: string;
  error?: string | null;
};

export function defaultProposedDeliveryDate(now: Date = new Date()): Date {
  return addDays(now, 3);
}

export function ProposedDeliveryPicker({
  value,
  onChange,
  timezone = DEFAULT_PROPOSED_DELIVERY_TIMEZONE,
  error,
}: ProposedDeliveryPickerProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const validationMessage = useMemo(() => error ?? validateProposedDeliveryAt(value), [error, value]);
  const preview = formatDeliveryInstantLabel(value.toISOString(), timezone);

  const onLaterDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed' || !date) return;
    onChange(date);
  };

  const onLaterTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type === 'dismissed' || !date) return;
    onChange(date);
  };

  const minimumDate = new Date();
  const maximumDate = addDays(new Date(), 31);

  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text className="text-base font-semibold text-ink">When will you deliver?</Text>
      <Text className="text-sm leading-5 text-muted">
        Pick a calendar date and time. This is your proposal only — the delivery countdown begins
        when you press Start after acceptance, not now.
      </Text>
      {preview ? <Text className="text-base font-semibold text-ink">{preview}</Text> : null}
      <Text className="text-xs text-subtle">Times are sent to the server as an absolute instant.</Text>
      {validationMessage ? <Text className="text-sm text-warning">{validationMessage}</Text> : null}

      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, date) => {
            if (date) onChange(date);
          }}
        />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Button label="Change date" variant="secondary" onPress={() => setShowDatePicker(true)} />
          <Button label="Change time" variant="secondary" onPress={() => setShowTimePicker(true)} />
        </View>
      )}

      {showDatePicker ? (
        <DateTimePicker
          value={value}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={onLaterDateChange}
        />
      ) : null}
      {showTimePicker ? (
        <DateTimePicker value={value} mode="time" onChange={onLaterTimeChange} />
      ) : null}
    </View>
  );
}