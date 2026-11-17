'use client';

import { useRouter, useSearchParams } from '@/lib/navigation';
import { useRef, useState } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(() => prefill ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedAmount = Number(amount.replace(/[^\d]/g, ''));
  const hasAmount = parsedAmount > 0;
  const currency = MARKET.currency;

  const goBack = () => {
    if (returnTo) router.replace(returnTo);
    else router.back();
  };

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
    router.replace(`/wallet/deposit/review?${params.toString()}`);
  };

  return (
    <FlowScreen title="Add money" onBack={goBack} bodyClassName="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold leading-9 text-ink">How much?</h2>
        <p className="text-base text-muted">
          {(topUpShortfall != null ? walletTopUpAddSubtitle(topUpShortfall) : null) ??
            'This money will be available to fund requests.'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex w-full flex-row items-center rounded-2xl border bg-surface px-5 py-6 text-left',
          hasAmount ? 'border-active' : 'border-hairline',
        )}
      >
        <MoneyAmountInput
          inputRef={inputRef}
          accessibilityLabel="Deposit amount"
          value={amount}
          onChangeText={(text) => {
            setAmount(text.replace(/[^\d]/g, ''));
            setValidationError(null);
          }}
        />
      </button>

      <div className="flex flex-wrap gap-2">
        {WALLET.addMoneyAmounts.map((preset) => {
          const selected = parsedAmount === preset;
          return (
            <button
              key={preset}
              type="button"
              className={cn(
                'rounded-xl px-4 py-2.5 text-base font-semibold active:opacity-90',
                selected ? 'border border-active bg-surface text-active' : 'bg-surface text-muted',
              )}
              onClick={() => {
                setAmount(String(preset));
                setValidationError(null);
              }}
            >
              {formatMoney(preset, currency)}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted">
        Min {formatMoney(WALLET.depositMinMajor, currency)} · Max {formatMoney(WALLET.depositMaxMajor, currency)}
      </p>

      {validationError ? <InlineError message={validationError} /> : null}

      <Button
        label="Continue"
        variant="active"
        size="lg"
        corner="2xl"
        className="w-full"
        disabled={!hasAmount}
        onClick={continueToReview}
      />
    </FlowScreen>
  );
}