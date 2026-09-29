import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import {
  geocodePlaceQuery,
  requestPosition,
  suggestAreaLabel,
  type Position,
} from '@/lib/location';
import { colors } from '@/theme';

const REFUSAL_COPY: Record<'permission-denied' | 'services-disabled' | 'unavailable', string> = {
  'permission-denied':
    'Active needs your location to work out who is nearby. Nobody sees where you are — only roughly how far away.',
  'services-disabled': 'Location services are switched off on this device.',
  unavailable: 'We could not get a location fix. Try again in a moment.',
};

/**
 * Location for a new request: current GPS fix or search by place name.
 */
export function LocationStep({
  position,
  onPositionChange,
  areaLabel,
  onAreaLabelChange,
}: {
  position: Position | null;
  onPositionChange: (position: Position | null) => void;
  areaLabel?: string;
  onAreaLabelChange?: (label: string) => void;
}) {
  const [isLocating, setIsLocating] = useState(false);
  const [refusal, setRefusal] = useState<keyof typeof REFUSAL_COPY | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const captureCurrent = async () => {
    setIsLocating(true);
    setRefusal(null);
    setSearchError(null);

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

  const searchPlace = async () => {
    setIsSearching(true);
    setSearchError(null);
    setRefusal(null);

    const coords = await geocodePlaceQuery(placeQuery);
    if (!coords) {
      setSearchError('We could not find that place. Try a nearby landmark or area name.');
      setIsSearching(false);
      return;
    }

    onPositionChange(coords);
    if (onAreaLabelChange) {
      onAreaLabelChange(placeQuery.trim());
    }
    setIsSearching(false);
  };

  if (!position) {
    return (
      <View className="gap-4">
        <Button
          label={isLocating ? 'Getting your location…' : 'Use my current location'}
          icon="locate"
          variant="secondary"
          loading={isLocating}
          onPress={() => void captureCurrent()}
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
            Used privately to find people near you. Your exact spot is shared only with the person
            you select.
          </Text>
        )}

        <View className="gap-3 border-t border-hairline pt-4">
          <Text className="text-base font-semibold text-ink">Or search for a place</Text>
          <TextField
            label="Area or address"
            value={placeQuery}
            onChangeText={(text) => {
              setPlaceQuery(text);
              setSearchError(null);
            }}
            placeholder="e.g. Yaba, Lagos"
            returnKeyType="search"
            onSubmitEditing={() => void searchPlace()}
          />
          {searchError ? <Text className="text-sm text-danger">{searchError}</Text> : null}
          <Button
            label={isSearching ? 'Finding place…' : 'Use this place'}
            variant="secondary"
            loading={isSearching}
            disabled={placeQuery.trim().length < 3}
            onPress={() => void searchPlace()}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 rounded-xl bg-active-soft p-3">
        <Ionicons name="checkmark-circle" size={18} color={colors.active} />
        <Text className="flex-1 text-sm text-ink">
          Location set. It stays hidden until you select someone.
        </Text>
      </View>

      {onAreaLabelChange ? (
        <TextField
          label="Area people will see"
          value={areaLabel ?? ''}
          onChangeText={onAreaLabelChange}
          placeholder="e.g. Yaba, Lagos"
          maxLength={120}
          hint="This is all others see before you select someone. Keep it general."
        />
      ) : null}

      <Button
        label="Choose a different location"
        variant="ghost"
        onPress={() => {
          onPositionChange(null);
          setPlaceQuery('');
        }}
      />
    </View>
  );
}
