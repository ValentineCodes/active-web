'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import {
  initializeWalletDeposit,
  readPendingDepositReference,
  setCheckoutSession,
} from '@/features/wallet/deposit-api';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import { formatMoney } from '@/lib/format';
import { toUserMessage } from '@/lib/supabase/errors';
import {
  readWalletReturnTo,
  WALLET_RETURN_TO_PARAM,
} from '@/features/wallet/deposit-navigation';
import { showAppToast } from '@/lib/toast';

export function WalletDepositReviewPage() {
  const router = useRouter();
  const search = useSearchParams();
  const amountMajor = Number(search.get('amount'));
  const returnTo = readWalletReturnTo(search.get(WALLET_RETURN_TO_PARAM) ?? undefined);
  const validationError = validateDepositAmountMajor(amountMajor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBack =
    `/wallet/add${returnTo ? `?${WALLET_RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : ''}`;

  if (validationError) {
    return (
      <FlowScreen title="Add money" backTo={addBack}>
        <InlineError message={validationError} />
        <Button label="Go back" variant="secondary" onClick={() => router.back()} />
      </FlowScreen>
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
        returnTo,
      });
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const openPaymentRecovery = () => {
    const reference = readPendingDepositReference();
    if (!reference) {
      showAppToast('Use Pay with Paystack first.', 'warning');
      return;
    }
    const params = new URLSearchParams({ reference });
    if (returnTo) params.set(WALLET_RETURN_TO_PARAM, returnTo);
    router.replace(`/wallet/deposit/checkout?${params.toString()}`);
  };

  return (
    <FlowScreen title="Complete payment" backTo={addBack} bodyClassName="flex flex-col gap-4">
      <Card tone="surface" className="!items-center !p-6 text-center">
        <p className="text-sm text-muted">You will pay</p>
        <p className="mt-2 text-3xl font-bold text-ink">{formatMoney(amountMajor, MARKET.currency)}</p>
        <p className="mt-3 text-xs text-subtle">
          Paystack opens in this tab. After payment, you return here while we verify with our servers.
        </p>
      </Card>

      {error ? <InlineError message={error} /> : null}

      <Button label="Pay with Paystack" loading={loading} onClick={() => void beginCheckout()} />
      <Button label="Resume last payment" variant="secondary" onClick={openPaymentRecovery} />
    </FlowScreen>
  );
}
