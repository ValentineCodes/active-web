import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import {
  initializeWalletDeposit,
  readPendingDepositReference,
  setCheckoutSession,
} from '@/features/wallet/deposit-api';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import { formatMoney } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { toUserMessage } from '@/lib/supabase/errors';
import { useColors } from '@/theme';

export default function WalletDepositReviewScreen() {
  const colors = useColors();
  const { amount: amountParam } = useLocalSearchParams<{ amount: string }>();
  const amountMajor = Number(amountParam);
  const validationError = validateDepositAmountMajor(amountMajor);
  const currency = MARKET.currency;
  const amountLabel = formatMoney(amountMajor, currency);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (validationError) {
    return (
      <Screen>
        <Header title="Complete payment" onBack={() => router.back()} />
        <ErrorState error={new Error(validationError)} onRetry={() => router.back()} />
      </Screen>
    );
  }

  const beginCheckout = async () => {
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

  const openPaymentRecovery = () => {
    const reference = readPendingDepositReference();
    if (!reference) {
      showAppToast('Use Pay below to start checkout first.');
      return;
    }
    router.replace({
      pathname: '/wallet/deposit/processing',
      params: { reference },
    });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Complete payment" onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow px-5 pb-8 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center gap-2 py-8">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
            You&apos;re adding
          </Text>
          <Text className="text-4xl font-bold text-ink">{amountLabel}</Text>
        </View>

        <View className="gap-4 rounded-2xl bg-elevated p-4">
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-active-soft">
              <Ionicons name="shield-checkmark" size={22} color={colors.active} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-base font-semibold text-ink">Secure payment</Text>
              <Text className="text-sm leading-5 text-muted">
                Choose your payment method in checkout
              </Text>
            </View>
          </View>

          {error ? <InlineError error={error} /> : null}

          <Button
            label={`Pay ${amountLabel}`}
            variant="active"
            size="lg"
            corner="2xl"
            className="w-full"
            loading={loading}
            onPress={() => void beginCheckout()}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel payment"
            disabled={loading}
            onPress={() => router.back()}
            className="items-center py-2 active:opacity-80"
          >
            <Text className="text-base font-medium text-muted">Cancel payment</Text>
          </Pressable>
        </View>

        <View className="mt-auto items-center pt-10">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="I could not complete the payment"
            disabled={loading}
            onPress={openPaymentRecovery}
            className="px-4 py-2 active:opacity-80"
          >
            <Text className="text-center text-sm text-muted">
              I couldn&apos;t complete the payment
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
