'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { InlineError } from '@/components/ui/StateView';
import { MARKET, WALLET } from '@/config/index';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import { WALLET_RETURN_TO_PARAM, readWalletReturnTo } from '@/features/wallet/deposit-navigation';
import {
  readWalletTopUpPrefill,
  readWalletTopUpShortfall,
  walletDepositFlowParams,
  walletTopUpAddSubtitle,
} from '@/features/wallet/top-up';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

export function WalletAddPage() {
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = readWalletReturnTo(search.get(WALLET_RETURN_TO_PARAM) ?? undefined);
  const prefill = readWalletTopUpPrefill(search.get('prefillAmount') ?? undefined);
  const topUpShortfall = readWalletTopUpShortfall(search.get('topUpShortfall') ?? undefined);
  const [amount, setAmount] = useState(() => prefill ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedAmount = Number(amount.replace(/[^\d]/g, ''));
  const hasAmount = parsedAmount > 0;

  const continueToReview = () => {
    const error = validateDepositAmountMajor(parsedAmount);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    const params = new URLSearchParams({
      amount: String(parsedAmount),
      ...walletDepositFlowParams({ returnTo }),
    });
    router.push(`/wallet/deposit/review?${params.toString()}`);
  };

  return (
    <FlowScreen
      title="Add money"
      backTo={returnTo ?? '/wallet'}
      bodyClassName="flex flex-col gap-4"
    >
      <p className="text-sm text-muted">
        {(topUpShortfall != null ? walletTopUpAddSubtitle(topUpShortfall) : null) ??
          'This money will be available to fund requests.'}
      </p>

      <MoneyAmountInput
        accessibilityLabel="Deposit amount"
        value={amount}
        onChangeText={(v) => {
          setAmount(v.replace(/[^\d]/g, ''));
          setValidationError(null);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {WALLET.addMoneyAmounts.map((preset) => {
          const selected = parsedAmount === preset;
          return (
            <button
              key={preset}
              type="button"
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold active:opacity-90',
                selected ? 'bg-active text-on-brand' : 'bg-surface text-ink',
              )}
              onClick={() => setAmount(String(preset))}
            >
              {formatMoney(preset, MARKET.currency)}
            </button>
          );
        })}
      </div>

      {validationError ? <InlineError message={validationError} /> : null}

      <Button label="Continue" disabled={!hasAmount} onClick={continueToReview} />
    </FlowScreen>
  );
}
