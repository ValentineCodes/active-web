import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import {
  consumeCheckoutSession,
  isDepositCallbackUrl,
  referenceFromCallbackUrl,
} from '@/features/wallet/deposit-api';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

export default function WalletDepositCheckoutScreen() {
  const colors = useColors();
  const [session] = useState(() => consumeCheckoutSession());
  const [handedOff, setHandedOff] = useState(false);

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

  const onNavigationChange = useCallback(
    (navState: WebViewNavigation) => {
      tryHandleCallbackUrl(navState.url);
    },
    [tryHandleCallbackUrl],
  );

  const leaveCheckout = useCallback(() => {
    if (handedOff) {
      router.back();
      return;
    }

    if (session?.reference) {
      goToProcessing(session.reference);
      return;
    }

    showAppToast('Payment cancelled');
    router.back();
  }, [goToProcessing, handedOff, session]);

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
      <View className="flex-1 bg-canvas">
        <Text className="border-b border-hairline px-5 py-3 text-sm text-muted">
          After Paystack shows success, wait for Active to confirm—or use the back arrow and we will
          check the payment for you.
        </Text>
        <WebView
          source={{ uri: session.authorizationUrl }}
          originWhitelist={['https://*', 'http://*', 'active://*', 'exp://*']}
          onNavigationStateChange={onNavigationChange}
          onShouldStartLoadWithRequest={(request) => {
            if (tryHandleCallbackUrl(request.url)) return false;
            return true;
          }}
          startInLoadingState
          renderLoading={() => (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={colors.brand} />
            </View>
          )}
        />
      </View>
    </Screen>
  );
}
