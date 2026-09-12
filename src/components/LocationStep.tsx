import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { requestPosition, suggestAreaLabel, type Position } from '@/lib/location';
import { colors } from '@/theme';

const REFUSAL_COPY: Record<'permission-denied' | 'services-disabled' | 'unavailable', string> = {
  'permission-denied':
    'Active needs your location to work out who is nearby. Nobody sees where you are — only roughly how far away.',
  'services-disabled': 'Location services are switched off on this device.',
  unavailable: 'We could not get a location fix. Try again in a moment.',
};

/**
 * The one place in the app that asks for location, used by both the request form and the
 * Go Active form. It runs when the user presses the button on it and never on mount, so
 * the system prompt always arrives attached to an action the person just chose.
 *
 * `areaLabel` is only collected for a request: it is the coarse, human description shown
 * to providers in place of coordinates.
 */
export function LocationStep({
  position,
  onPositionChange,
  areaLabel,
  onAreaLabelChange,
  purpose,
}: {
  position: Position | null;
  onPositionChange: (position: Position | null) => void;
  areaLabel?: string;
  onAreaLabelChange?: (label: string) => void;
  purpose: 'request' | 'active';
}) {
  const [isLocating, setIsLocating] = useState(false);
  const [refusal, setRefusal] = useState<keyof typeof REFUSAL_COPY | null>(null);

  const capture = async () => {
    setIsLocating(true);
    setRefusal(null);

    const result = await requestPosition();

    if (!result.ok) {
      setRefusal(result.reason);
      onPositionChange(null);
      setIsLocating(false);
      return;
    }

    onPositionChange(result.position);

    if (onAreaLabelChange && !areaLabel) {
      const suggestion = await suggestAreaLabel(result.position);
      if (suggestion) onAreaLabelChange(suggestion);
    }

    setIsLocating(false);
  };

  if (!position) {
    return (
      <View className="gap-3">
        <Button
          label={isLocating ? 'Getting your location…' : 'Use my current location'}
          icon="locate"
          variant="secondary"
          loading={isLocating}
          onPress={capture}
        />

        {refusal ? (
          <View className="gap-3 rounded-xl bg-warning-soft p-4">
            <Text className="text-sm text-warning">{REFUSAL_COPY[refusal]}</Text>
            {refusal === 'permission-denied' ? (
              <Button
                label="Open settings"
                variant="secondary"
                onPress={() => Linking.openSettings()}
              />
            ) : null}
          </View>
        ) : (
          <Text className="text-sm text-muted">
            {purpose === 'request'
              ? 'Used privately to find people near you. Your exact spot is shared only with the person you accept.'
              : 'Used privately to match you with nearby requests. Nobody sees where you are.'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 rounded-xl bg-active-soft p-3">
        <Ionicons name="checkmark-circle" size={18} color={colors.active} />
        <Text className="flex-1 text-sm text-ink">
          {purpose === 'request'
            ? 'Location captured. It stays hidden until you accept someone.'
            : 'Location captured. Used only to match you with nearby requests.'}
        </Text>
      </View>

      {onAreaLabelChange ? (
        <TextField
          label="Area people will see"
          value={areaLabel ?? ''}
          onChangeText={onAreaLabelChange}
          placeholder="e.g. Yaba, Lagos"
          maxLength={120}
          hint="This is all providers see before you accept one. Keep it general."
        />
      ) : null}

      <Button
        label="Use a different location"
        variant="ghost"
        onPress={() => onPositionChange(null)}
      />
    </View>
  );
}
