import { Text, View } from 'react-native';

import { summarizeRequestFunding } from '@/features/requests/funding';
import { formatMoney } from '@/lib/format';

export function RequestFundingSummary({ offeredAmount }: { offeredAmount: number }) {
  const funding = summarizeRequestFunding(offeredAmount);

  return (
    <View className="gap-2 border-t border-hairline pt-3">
      <Text className="text-sm font-semibold text-ink">Your offer</Text>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Offer</Text>
        <Text className="text-sm text-ink">
          {formatMoney(funding.offerAmount, funding.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">Fee</Text>
        <Text className="text-sm text-ink">
          {formatMoney(funding.serviceFee, funding.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between border-t border-hairline pt-2">
        <Text className="text-sm font-semibold text-ink">Held from wallet</Text>
        <Text className="text-sm font-semibold text-ink">
          {formatMoney(funding.total, funding.currency)}
        </Text>
      </View>
      <Text className="text-xs text-muted">
        Held from your wallet when your request goes live. People nearby only see your offer amount.
      </Text>
    </View>
  );
}
