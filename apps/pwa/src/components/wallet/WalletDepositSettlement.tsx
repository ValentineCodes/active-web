import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import {
  readPendingDepositReference,
  readPendingDepositReturnTo,
  verifyWalletDeposit,
  waitForWalletDepositSettlement,
} from '@/features/wallet/deposit-api';
import {
  readWalletReturnTo,
  WALLET_RETURN_TO_PARAM,
  clearWalletDepositNavigationState,
} from '@/features/wallet/deposit-navigation';
import { invalidateWalletQueries } from '@/features/wallet/api';
import { MARKET } from '@/config/index';
import { formatMoney } from '@/lib/format';
import { isNetworkError, toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { koboToMajor } from '@/features/wallet/kobo';

type Phase = 'processing' | 'success' | 'failed' | 'still_processing';

export function WalletDepositSettlement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const referenceFromRoute =
    search.get('reference') ?? search.get('trxref') ?? readPendingDepositReference();
  const returnTo =
    readWalletReturnTo(search.get(WALLET_RETURN_TO_PARAM) ?? undefined) ??
    readWalletReturnTo(readPendingDepositReturnTo() ?? undefined);

  const [settlementReference] = useState<string | null>(referenceFromRoute);
  const [phase, setPhase] = useState<Phase>(() => (referenceFromRoute ? 'processing' : 'failed'));
  const [error, setError] = useState<Error | null>(() =>
    referenceFromRoute ? null : new Error('Missing payment reference'),
  );
  const [amountMajor, setAmountMajor] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!settlementReference && phase === 'failed') {
      navigate('/wallet/add', { replace: true });
    }
  }, [navigate, phase, settlementReference]);

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
      setError(new Error(toUserMessage(err)));
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
      setError(new Error(toUserMessage(err)));
      setPhase('failed');
    } finally {
      setRetrying(false);
    }
  };

  const leave = () => {
    clearWalletDepositNavigationState();
    navigate(returnTo ?? '/wallet', { replace: true });
  };

  if (phase === 'processing') {
    return (
      <SettlementCenter title="Payment processing" body="We're confirming your payment with our servers before updating your balance." />
    );
  }

  if (phase === 'still_processing') {
    return (
      <div className="flex flex-1 flex-col gap-4 py-2">
        <SettlementCenter
          title="Still confirming"
          body="Your payment may still be on its way. Your available balance will update only after we confirm it."
        />
        <Button label="Check again" loading={retrying} onClick={() => void checkOnce()} />
        <Button label={returnTo ? 'Back to request' : 'Back to wallet'} variant="secondary" onClick={leave} />
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="flex flex-1 flex-col gap-4 py-2">
        <div className="rounded-2xl bg-surface p-6 text-center">
          <h2 className="text-lg font-semibold text-ink">Payment not confirmed</h2>
          <p className="mt-2 text-sm text-muted">
            {error?.message ?? 'Nothing was added to your wallet.'}
          </p>
        </div>
        <Button label="Try again" loading={retrying} onClick={() => void retryConfirmation()} />
        <Button label={returnTo ? 'Back to request' : 'Back to wallet'} variant="secondary" onClick={leave} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-6 text-center">
        <h2 className="text-xl font-semibold text-ink">Payment successful</h2>
        {amountMajor != null ? (
          <p className="text-3xl font-bold text-brand">{formatMoney(amountMajor, MARKET.currency)}</p>
        ) : null}
        <p className="text-sm text-muted">Your available balance has been updated.</p>
      </div>
      <Button label={returnTo ? 'Continue' : 'Back to wallet'} onClick={leave} />
      {returnTo ? (
        <Link to="/wallet" className="text-center text-sm font-semibold text-brand">
          View wallet
        </Link>
      ) : null}
    </div>
  );
}

function SettlementCenter({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-surface px-6 py-12 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
