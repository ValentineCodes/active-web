import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { LoadingScreen } from '@/components/LoadingScreen';
import {
  referenceFromSearchParams,
  readPendingDepositReturnTo,
} from '@/features/wallet/deposit-api';
import { WALLET_RETURN_TO_PARAM } from '@/features/wallet/deposit-navigation';

/** Paystack redirect target — only forwards reference to checkout verification (never credits locally). */
export function WalletDepositCallbackPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();

  useEffect(() => {
    const reference = referenceFromSearchParams(search);
    if (!reference) {
      navigate('/wallet/add', { replace: true });
      return;
    }
    const params = new URLSearchParams({ reference });
    const returnTo = readPendingDepositReturnTo();
    if (returnTo) params.set(WALLET_RETURN_TO_PARAM, returnTo);
    navigate(`/wallet/deposit/checkout?${params.toString()}`, { replace: true });
  }, [navigate, search]);

  return <LoadingScreen label="Confirming payment…" />;
}
