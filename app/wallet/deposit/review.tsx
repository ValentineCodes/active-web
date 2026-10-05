import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import { initializeWalletDeposit, setCheckoutSession } from '@/features/wallet/deposit-api';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import { formatMoney } from '@/lib/format';
import { toUserMessage } from '@/lib/supabase/errors';

export default function WalletDepositReviewScreen() {
  const { amount: amountParam } = useLocalSearchParams<{ amount: string }>();
  const amountMajor = Number(amountParam);
  const validationError = validateDepositAmountMajor(amountMajor);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (validationError) {
    return (
      <Screen>
        <Header title="Review" onBack={() => router.back()} />
        <ErrorState error={new Error(validationError)} onRetry={() => router.back()} />
      </Screen>
    );
  }

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await initializeWalletDeposit(amountMajor);
      setCheckoutSession({
        authorizationUrl: result.authorization_url,
        reference: result.reference,
        amountKobo: result.amount_kobo,
        depositId: result.deposit_id,
        amountMajor,
      });
      router.push('/wallet/deposit/checkout');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(toUserMessage(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Review" onBack={() => router.back()} />

      <ScrollView contentContainerClassName="gap-6 px-5 pb-8 pt-2" className="flex-1">
        <View className="gap-2">
          <Text className="text-3xl font-bold leading-9 text-ink">Confirm payment</Text>
          <Text className="text-base text-muted">
            You&apos;ll pay with card or bank transfer. Your balance updates only after we confirm
            the payment.
          </Text>
        </View>

        <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
          <View className="flex-row items-center justify-between px-4 py-4">
            <Text className="text-base text-muted">Amount</Text>
            <Text className="text-xl font-bold text-ink">
              {formatMoney(amountMajor, MARKET.currency)}
            </Text>
          </View>
          <View className="mx-4 h-px bg-hairline" />
          <View className="flex-row items-center justify-between px-4 py-4">
            <Text className="text-base text-muted">Payment method</Text>
            <Text className="text-base font-semibold text-ink">Card or bank</Text>
          </View>
        </View>

        {error ? <InlineError error={error} /> : null}
      </ScrollView>

      <View className="gap-3 border-t border-hairline p-5">
        <Button
          label="Continue to payment"
          variant="active"
          size="lg"
          corner="2xl"
          className="w-full"
          loading={loading}
          onPress={() => void startCheckout()}
        />
      </View>
    </Screen>
  );
}
