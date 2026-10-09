import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState } from '@/components/ui/StateView';
import {
  readPendingDepositReturnTo,
  verifyWalletDeposit,
  waitForWalletDepositSettlement,
} from '@/features/wallet/deposit-api';
import { invalidateWalletQueries } from '@/features/wallet/api';
import { formatMoney } from '@/lib/format';
import { MARKET } from '@/config';
import { showAppToast } from '@/lib/toast';
import { koboToMajor } from '@/features/wallet/kobo';
import { isNetworkError, toUserMessage } from '@/lib/supabase/errors';
import {
  exitWalletDepositAfterSuccess,
  exitWalletDepositLeaving,
  readWalletReturnTo,
} from '@/features/wallet/deposit-navigation';
import { useColors } from '@/theme';

type Phase = 'processing' | 'success' | 'failed' | 'still_processing';

export default function WalletDepositProcessingScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { reference: referenceParam, returnTo: returnToParam } = useLocalSearchParams<{
    reference?: string;
    returnTo?: string;
  }>();
  const returnTo =
    readWalletReturnTo(returnToParam) ??
    readWalletReturnTo(readPendingDepositReturnTo() ?? undefined);
  const reference = typeof referenceParam === 'string' ? referenceParam : referenceParam?.[0];

  const [phase, setPhase] = useState<Phase>(() => (reference ? 'processing' : 'failed'));
  const [error, setError] = useState<Error | null>(() =>
    reference ? null : new Error('Missing payment reference'),
  );
  const [amountMajor, setAmountMajor] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const applySettlementResult = useCallback(
    async (result: Awaited<ReturnType<typeof waitForWalletDepositSettlement>>) => {
      if (result.wallet_credited) {
        setAmountMajor(koboToMajor(result.amount_kobo));
        setPhase('success');
        await invalidateWalletQueries(queryClient);
        showAppToast('Money added');
        return;
      }

      if (result.fulfillment_rejected) {
        setError(
          new Error(
            'We could not match this payment to your deposit. Contact support if you were charged.',
          ),
        );
        setPhase('failed');
        return;
      }

      if (result.timed_out && result.status === 'success') {
        setPhase('still_processing');
        return;
      }

      if (result.deposit_status === 'failed' || result.status === 'failed') {
        setError(new Error('Payment failed. Your wallet was not charged.'));
        setPhase('failed');
        return;
      }

      setError(new Error('Payment was not confirmed. Your wallet was not charged.'));
      setPhase('failed');
    },
    [queryClient],
  );

  useEffect(() => {
    if (!reference) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await waitForWalletDepositSettlement(reference);
        if (cancelled) return;
        await applySettlementResult(result);
      } catch (err) {
        if (cancelled) return;
        const message = isNetworkError(err)
          ? 'You appear to be offline. Check your connection and try again.'
          : toUserMessage(err);
        setError(new Error(message));
        setPhase('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySettlementResult, reference]);

  const retryConfirmation = async () => {
    if (!reference) return;
    setRetrying(true);
    setError(null);
    setPhase('processing');
    try {
      const result = await waitForWalletDepositSettlement(reference, {
        maxAttempts: 10,
        intervalMs: 2000,
      });
      await applySettlementResult(result);
    } catch (err) {
      const message = isNetworkError(err)
        ? 'You appear to be offline. Check your connection and try again.'
        : toUserMessage(err);
      setError(new Error(message));
      setPhase('failed');
    } finally {
      setRetrying(false);
    }
  };

  const checkOnce = async () => {
    if (!reference) return;
    setRetrying(true);
    try {
      const result = await verifyWalletDeposit(reference);
      await applySettlementResult({ ...result, timed_out: false });
    } catch (err) {
      const message = isNetworkError(err)
        ? 'You appear to be offline. Check your connection and try again.'
        : toUserMessage(err);
      setError(new Error(message));
      setPhase('failed');
    } finally {
      setRetrying(false);
    }
  };

  if (phase === 'processing') {
    return (
      <Screen>
        <Header title="Processing" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <ActivityIndicator size="large" color={colors.brand} />
          <Text className="text-center text-lg font-semibold text-ink">Payment processing</Text>
          <Text className="text-center text-base leading-6 text-muted">
            We&apos;re confirming your payment before updating your balance. This can take a little
            while.
          </Text>
        </View>
      </Screen>
    );
  }

  if (phase === 'still_processing') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Processing" onBack={() => exitWalletDepositLeaving(returnTo)} />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <ActivityIndicator size="large" color={colors.brand} />
          <Text className="text-center text-lg font-semibold text-ink">Still confirming</Text>
          <Text className="text-center text-base leading-6 text-muted">
            Your payment may still be on its way. Your available balance will update only after we
            confirm it—nothing has been added yet.
          </Text>
        </View>
        <View className="gap-3 p-5">
          <Button
            label="Check again"
            variant="active"
            size="lg"
            corner="2xl"
            className="w-full"
            loading={retrying}
            onPress={() => void checkOnce()}
          />
          <Button
            label={returnTo ? 'Back to request' : 'Back to wallet'}
            variant="secondary"
            size="lg"
            corner="2xl"
            className="w-full"
            onPress={() => exitWalletDepositLeaving(returnTo)}
          />
        </View>
      </Screen>
    );
  }

  if (phase === 'failed') {
    return (
      <Screen>
        <Header title="Payment" onBack={() => exitWalletDepositLeaving(returnTo)} />
        <ErrorState
          error={error ?? new Error('Payment could not be confirmed')}
          onRetry={() => void retryConfirmation()}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-center text-2xl font-bold text-ink">Payment successful</Text>
        {amountMajor !== null ? (
          <Text className="text-center text-4xl font-bold text-active">
            {formatMoney(amountMajor, MARKET.currency)}
          </Text>
        ) : null}
        <Text className="text-center text-base leading-6 text-muted">
          Your available balance has been updated.
        </Text>
      </View>
      <View className="p-5">
        <Button
          label={returnTo ? 'Continue' : 'Back to wallet'}
          variant="active"
          size="lg"
          corner="2xl"
          className="w-full"
          onPress={() => exitWalletDepositAfterSuccess(returnTo)}
        />
      </View>
    </Screen>
  );
}
