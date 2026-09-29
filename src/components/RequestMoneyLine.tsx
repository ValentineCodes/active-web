import { Text, View } from 'react-native';

import type { RequestMoneyDisplay } from '@/features/requests/payment-display';

export function RequestMoneyLine({ display }: { display: RequestMoneyDisplay }) {
  return (
    <View className="gap-0.5">
      <Text className="text-sm font-semibold text-muted">{display.label}</Text>
      <Text className="text-lg font-bold text-ink">{display.amount}</Text>
      {display.hint ? <Text className="text-sm text-muted">{display.hint}</Text> : null}
    </View>
  );
}
