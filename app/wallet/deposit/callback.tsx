import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { LoadingState } from '@/components/ui/StateView';

/** Paystack redirect target after checkout (also opened via deep link). */
export default function WalletDepositCallbackScreen() {
  const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();

  const reference =
    (typeof params.reference === 'string' ? params.reference : params.reference?.[0]) ??
    (typeof params.trxref === 'string' ? params.trxref : params.trxref?.[0]);

  useEffect(() => {
    if (!reference) {
      router.replace('/wallet/add');
      return;
    }

    router.replace({
      pathname: '/wallet/deposit/processing',
      params: { reference },
    });
  }, [reference]);

  return (
    <Screen>
      <Header title="Payment" />
      <LoadingState label="Confirming payment…" />
    </Screen>
  );
}
