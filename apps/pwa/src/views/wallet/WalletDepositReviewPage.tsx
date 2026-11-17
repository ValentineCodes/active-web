'use client';

import { useRouter, useSearchParams } from '@/lib/navigation';
import { useEffect, useRef, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { initializeWalletDeposit, setCheckoutSession } from '@/features/wallet/deposit-api';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import {
  readWalletReturnTo,
  WALLET_RETURN_TO_PARAM,
} from '@/features/wallet/deposit-navigation';
import { formatMoney } from '@/lib/format';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme/ThemeProvider';

export function WalletDepositReviewPage() {
  const colors = useColors();
  const router = useRouter();
  const search = useSearchParams();
  const amountMajor = Number(search.get('amount'));
  const returnTo = readWalletReturnTo(search.get(WALLET_RETURN_TO_PARAM) ?? undefined);
  const validationError = validateDepositAmountMajor(amountMajor);
  const currency = MARKET.currency;
  const amountLabel = formatMoney(amountMajor, currency);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const validationToastShown = useRef(false);

  useEffect(() => {
    if (!validationError) {
      validationToastShown.current = false;
      return;
    }
    if (validationToastShown.current) return;
    validationToastShown.current = true;
    showAppToast(validationError, 'warning');
  }, [validationError]);

  if (validationError) {
    return (
      <FlowScreen title="Complete payment" onBack={() => router.back()}>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-3">
          <Button label="Go back" variant="secondary" size="lg" corner="2xl" onClick={() => router.back()} />
        </div>
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
      const params = new URLSearchParams();
      if (returnTo) params.set(WALLET_RETURN_TO_PARAM, returnTo);
      const qs = params.toString();
      router.replace(qs ? `/wallet/deposit/checkout?${qs}` : '/wallet/deposit/checkout');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(toUserMessage(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FlowScreen
      title="Complete payment"
      onBack={() => router.back()}
      bodyClassName="flex min-h-0 flex-1 flex-col !px-5 pb-8 pt-4"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">You&apos;re adding</p>
          <p className="text-4xl font-bold text-ink">{amountLabel}</p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl bg-elevated p-4">
          <div className="flex flex-row items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-active-soft">
              <IonIcon icon={ionIcons['shield-checkmark']} size={22} color={colors.active} />
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <p className="text-base font-semibold text-ink">Secure payment</p>
              <p className="text-sm leading-5 text-muted">Choose your payment method in checkout</p>
            </div>
          </div>

          {error ? <InlineError error={error} /> : null}

          <Button
            label="Pay with Paystack"
            variant="active"
            size="lg"
            corner="2xl"
            className="w-full"
            loading={loading}
            onClick={() => void beginCheckout()}
          />

          <button
            type="button"
            disabled={loading}
            onClick={() => router.back()}
            className="py-2 text-center text-base font-medium text-muted active:opacity-80 disabled:opacity-50"
          >
            Cancel payment
          </button>
        </div>
      </div>
    </FlowScreen>
  );
}