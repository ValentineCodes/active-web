'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import {
  referenceFromSearchParams,
  readPendingDepositReturnTo,
} from '@/features/wallet/deposit-api';
import { WALLET_RETURN_TO_PARAM } from '@/features/wallet/deposit-navigation';

/** Paystack redirect target — only forwards reference to checkout verification (never credits locally). */
export function WalletDepositCallbackPage() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const reference = referenceFromSearchParams(search);
    if (!reference) {
      router.replace('/wallet/add');
      return;
    }
    const params = new URLSearchParams({ reference });
    const returnTo = readPendingDepositReturnTo();
    if (returnTo) params.set(WALLET_RETURN_TO_PARAM, returnTo);
    router.replace(`/wallet/deposit/checkout?${params.toString()}`);
  }, [router, search]);

  return <LoadingScreen label="Confirming payment…" />;
}
