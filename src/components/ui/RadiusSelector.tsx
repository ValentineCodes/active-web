import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { formatRadius } from '@/lib/format';

/** A row of equal-width pills for picking a radius in metres — search or service. */
export function RadiusSelector({
  options,
  value,
  onChange,
}: {
  options: readonly number[];
  value: number;
  onChange: (metres: number) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {options.map((radius) => (
        <Button
          key={radius}
          label={formatRadius(radius)}
          variant={value === radius ? 'primary' : 'secondary'}
          onPress={() => onChange(radius)}
          className="flex-1"
        />
      ))}
    </View>
  );
}
