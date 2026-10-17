import { Text, View } from 'react-native';

import { summarizeRequestFunding } from '@/features/requests/funding';
import { formatMoney } from '@/lib/format';

export function RequestFundingSummary({ offeredAmount }: { offeredAmount: number }) {
  const funding = summarizeRequestFunding(offeredAmount);

  return (
    <View className="gap-2 border-t border-hairline pt-3">
      <Text className="text-sm font-semibold text-ink">Your offer</Text>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Held from wallet</Text>
        <Text className="text-sm font-semibold text-ink">
          {formatMoney(funding.total, funding.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Helper receives (90%)</Text>
        <Text className="text-sm text-ink">
          {formatMoney(funding.providerReceives, funding.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Active fee (10% at payout)</Text>
        <Text className="text-sm text-ink">
          {formatMoney(funding.serviceFee, funding.currency)}
        </Text>
      </View>
      <Text className="text-xs text-muted">
        Your full offer is held when the request goes live. When the job completes, the helper is
        paid 90% and Active keeps 10%. People nearby only see your offer amount.
      </Text>
    </View>
  );
}
