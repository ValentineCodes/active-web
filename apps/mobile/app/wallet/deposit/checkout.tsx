import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import {
  consumeCheckoutSession,
  depositCallbackUrl,
  isDepositCallbackUrl,
  readPendingDepositReturnTo,
  referenceFromCallbackUrl,
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

/** iOS closes ASWebAuthenticationSession after redirect; dismiss then throws. */
function dismissBrowserSafely(): void {
  void WebBrowser.dismissBrowser().catch(() => undefined);
}

type Phase = 'browser' | 'processing' | 'success' | 'failed' | 'still_processing';

export default function WalletDepositCheckoutScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { reference: referenceParam, returnTo: returnToParam } = useLocalSearchParams<{
    reference?: string;
    returnTo?: string;
  }>();
  const returnTo =
    readWalletReturnTo(returnToParam) ??
    readWalletReturnTo(readPendingDepositReturnTo() ?? undefined);
  const referenceFromRoute =
    typeof referenceParam === 'string' ? referenceParam : referenceParam?.[0];

  const [session] = useState(() => consumeCheckoutSession());
  const [settlementReference, setSettlementReference] = useState<string | null>(
    () => referenceFromRoute ?? null,
  );
  const [phase, setPhase] = useState<Phase>(() => {
    if (referenceFromRoute) return 'processing';
    if (session) return 'browser';
    return 'browser';
  });
  const [error, setError] = useState<Error | null>(() =>
    referenceFromRoute || session ? null : new Error('Missing payment reference'),
  );
  const [amountMajor, setAmountMajor] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const openedBrowserRef = useRef(false);
  const browserResolvedRef = useRef(false);
  const failedToastShown = useRef(false);

  useEffect(() => {
    if (phase !== 'failed') {
      failedToastShown.current = false;
      return;
    }
    if (failedToastShown.current) return;
    failedToastShown.current = true;
    showAppToast(
      toUserMessage(error ?? new Error('Payment could not be confirmed')),
      'warning',
    );
  }, [error, phase]);

  useEffect(() => {
    if (!session && !referenceFromRoute) {
      router.replace('/wallet/add');
    }
  }, [referenceFromRoute, session]);

  const beginSettlement = useCallback((reference: string) => {
    browserResolvedRef.current = true;
    setSettlementReference(reference);
    setPhase('processing');
    setError(null);
  }, []);

  const tryHandleCallbackUrl = useCallback(
    (url: string): boolean => {
      if (browserResolvedRef.current || !session || !isDepositCallbackUrl(url)) return false;
      const reference = referenceFromCallbackUrl(url) ?? session.reference;
      beginSettlement(reference);
      return true;
    },
    [beginSettlement, session],
  );

  const finishWithoutCallback = useCallback(() => {
    if (browserResolvedRef.current) return;

    if (session?.reference) {
      beginSettlement(session.reference);
      return;
    }

    showAppToast('Payment cancelled');
    router.back();
  }, [beginSettlement, session]);

  const leaveBrowser = useCallback(() => {
    dismissBrowserSafely();
    if (browserResolvedRef.current) return;
    finishWithoutCallback();
  }, [finishWithoutCallback]);

  useEffect(() => {
    if (!session || phase !== 'browser' || openedBrowserRef.current) return;
    openedBrowserRef.current = true;

    let cancelled = false;

    void (async () => {
      const result = await WebBrowser.openAuthSessionAsync(
        session.authorizationUrl,
        depositCallbackUrl(),
      );

      if (cancelled || browserResolvedRef.current) return;

      if (result.type === 'success' && result.url) {
        if (!tryHandleCallbackUrl(result.url)) {
          finishWithoutCallback();
        }
        return;
      }

      finishWithoutCallback();
    })();

    return () => {
      cancelled = true;
    };
  }, [finishWithoutCallback, phase, session, tryHandleCallbackUrl]);

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
    if (phase !== 'processing' || !settlementReference) return;

    let cancelled = false;

    void (async () => {
      try {
        const result = await waitForWalletDepositSettlement(settlementReference);
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
  }, [applySettlementResult, phase, settlementReference]);

  const retryConfirmation = async () => {
    if (!settlementReference) return;
    setRetrying(true);
    setError(null);
    setPhase('processing');
    try {
      const result = await waitForWalletDepositSettlement(settlementReference, {
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
    if (!settlementReference) return;
    setRetrying(true);
    try {
      const result = await verifyWalletDeposit(settlementReference);
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

  if (!session && !referenceFromRoute) {
    return (
      <Screen>
        <Header title="Payment" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (phase === 'browser' && session) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Payment" onBack={leaveBrowser} />
        <View className="flex-1 items-center justify-center gap-4 bg-canvas px-5">
          <ActivityIndicator color={colors.brand} />
          <Text className="text-center text-sm leading-5 text-muted">
            Complete payment in the browser. After Paystack shows success, return here—we will confirm
            your deposit. You can also use the back arrow and we will check the payment for you.
          </Text>
        </View>
      </Screen>
    );
  }

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
      <Screen edges={['top', 'bottom']}>
        <Header title="Payment" onBack={() => exitWalletDepositLeaving(returnTo)} />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-lg font-semibold text-ink">Payment not confirmed</Text>
          <Text className="text-center text-base leading-6 text-muted">
            Nothing was added to your wallet. You can try confirming again or go back.
          </Text>
        </View>
        <View className="gap-3 p-5">
          <Button
            label="Try again"
            variant="active"
            size="lg"
            corner="2xl"
            className="w-full"
            loading={retrying}
            onPress={() => void retryConfirmation()}
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
