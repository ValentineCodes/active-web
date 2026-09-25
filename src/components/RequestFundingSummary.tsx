import { Text, View } from 'react-native';

import { summarizeRequestFunding } from '@/features/requests/funding';
import { formatMoney } from '@/lib/format';

export function RequestFundingSummary({ offeredAmount }: { offeredAmount: number }) {
  const funding = summarizeRequestFunding(offeredAmount);

  return (
    <View className="gap-2 border-t border-hairline pt-3">
      <Text className="text-sm font-semibold text-ink">Funding summary</Text>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Provider amount</Text>
        <Text className="text-sm text-ink">
          {formatMoney(funding.providerAmount, funding.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Active service fee</Text>
        <Text className="text-sm text-ink">
          {formatMoney(funding.serviceFee, funding.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between border-t border-hairline pt-2">
        <Text className="text-sm font-semibold text-ink">Total</Text>
        <Text className="text-sm font-semibold text-ink">
          {formatMoney(funding.total, funding.currency)}
        </Text>
      </View>
      <Text className="text-xs text-muted">
        This amount is held when your request goes live. Providers see your offer, not this
        breakdown.
      </Text>
    </View>
  );
}
