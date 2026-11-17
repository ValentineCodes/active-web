import { Text, View } from 'react-native';

import { CheckboxRow } from '@/components/ui/CheckboxRow';
import type { PaymentStructure } from '@/features/requests/milestones';

export function PaymentStructureSelector({
  value,
  onChange,
}: {
  value: PaymentStructure;
  onChange: (next: PaymentStructure) => void;
}) {
  const milestonesEnabled = value === 'milestone';

  return (
    <View className="gap-2">
      <CheckboxRow
        label="Set up milestones"
        checked={milestonesEnabled}
        onChange={(next) => onChange(next ? 'milestone' : 'single')}
      />
      <Text className="text-sm leading-5 text-muted">
        Optional. Pay in steps after you approve each one. Leave off for a single payment when the job is
        done.
      </Text>
    </View>
  );
}