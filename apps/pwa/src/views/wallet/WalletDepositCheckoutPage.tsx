'use client';

import { useRouter, useSearchParams } from '@/lib/navigation';
import { useEffect, useRef, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { WalletDepositSettlement } from '@/components/wallet/WalletDepositSettlement';
import { LoadingState } from '@/components/ui/StateView';
import { consumeCheckoutSession } from '@/features/wallet/deposit-api';
import {
  exitWalletDepositLeaving,
  readWalletReturnTo,
  WALLET_RETURN_TO_PARAM,
} from '@/features/wallet/deposit-navigation';

export function WalletDepositCheckoutPage() {
  const router = useRouter();
  const search = useSearchParams();
  const referenceFromRoute = search.get('reference');
  const returnTo = readWalletReturnTo(search.get(WALLET_RETURN_TO_PARAM) ?? undefined);

  const [session] = useState(() => consumeCheckoutSession());
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (referenceFromRoute || !session?.authorizationUrl || redirectedRef.current) return;
    redirectedRef.current = true;
    window.location.assign(session.authorizationUrl);
  }, [referenceFromRoute, session]);

  useEffect(() => {
    if (!session && !referenceFromRoute) {
      router.replace('/wallet/add');
    }
  }, [referenceFromRoute, router, session]);

  if (referenceFromRoute) {
    return (
      <FlowScreen
        title="Processing"
        onBack={() => exitWalletDepositLeaving(router, returnTo)}
        bodyClassName="flex min-h-0 flex-1 flex-col !px-5"
      >
        <WalletDepositSettlement />
      </FlowScreen>
    );
  }

  if (session) {
    return (
      <FlowScreen title="Payment" onBack={() => router.back()} bodyClassName="flex flex-col gap-4 !px-5">
        <div className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-4">
          <LoadingState label="Opening checkout…" />
          <p className="max-w-xs text-center text-sm leading-5 text-muted">
            Complete payment in the browser. After Paystack shows success, return here—we will confirm
            your deposit. You can also use the back arrow and we will check the payment for you.
          </p>
        </div>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title="Payment" onBack={() => router.back()}>
      <LoadingState />
    </FlowScreen>
  );
}