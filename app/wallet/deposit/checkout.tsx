import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import {
  consumeCheckoutSession,
  depositCallbackUrl,
  isDepositCallbackUrl,
  referenceFromCallbackUrl,
} from '@/features/wallet/deposit-api';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

/** iOS closes ASWebAuthenticationSession after redirect; dismiss then throws. */
function dismissBrowserSafely(): void {
  void WebBrowser.dismissBrowser().catch(() => undefined);
}

export default function WalletDepositCheckoutScreen() {
  const colors = useColors();
  const [session] = useState(() => consumeCheckoutSession());
  const [handedOff, setHandedOff] = useState(false);
  const openedBrowserRef = useRef(false);

  useEffect(() => {
    if (!session && !handedOff) {
      router.replace('/wallet/add');
    }
  }, [session, handedOff]);

  const goToProcessing = useCallback(
    (reference: string) => {
      if (handedOff) return;
      setHandedOff(true);
      router.replace({
        pathname: '/wallet/deposit/processing',
        params: { reference },
      });
    },
    [handedOff],
  );

  const tryHandleCallbackUrl = useCallback(
    (url: string): boolean => {
      if (handedOff || !session || !isDepositCallbackUrl(url)) return false;
      const reference = referenceFromCallbackUrl(url) ?? session.reference;
      goToProcessing(reference);
      return true;
    },
    [goToProcessing, handedOff, session],
  );

  const finishWithoutCallback = useCallback(() => {
    if (handedOff) return;

    if (session?.reference) {
      goToProcessing(session.reference);
      return;
    }

    showAppToast('Payment cancelled');
    router.back();
  }, [goToProcessing, handedOff, session]);

  const leaveCheckout = useCallback(() => {
    dismissBrowserSafely();
    if (handedOff) {
      router.back();
      return;
    }
    finishWithoutCallback();
  }, [finishWithoutCallback, handedOff]);

  useEffect(() => {
    if (!session || handedOff || openedBrowserRef.current) return;
    openedBrowserRef.current = true;

    let cancelled = false;

    void (async () => {
      const result = await WebBrowser.openAuthSessionAsync(
        session.authorizationUrl,
        depositCallbackUrl(),
      );

      if (cancelled || handedOff) return;

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
  }, [finishWithoutCallback, handedOff, session, tryHandleCallbackUrl]);

  if (!session) {
    return (
      <Screen>
        <Header title="Payment" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Payment" onBack={leaveCheckout} />
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
