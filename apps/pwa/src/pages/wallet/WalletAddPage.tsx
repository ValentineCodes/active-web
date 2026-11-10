import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { MARKET, WALLET } from '@/config/index';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import {
  WALLET_RETURN_TO_PARAM,
  readWalletReturnTo,
} from '@/features/wallet/deposit-navigation';
import {
  readWalletTopUpPrefill,
  readWalletTopUpShortfall,
  walletDepositFlowParams,
  walletTopUpAddSubtitle,
} from '@/features/wallet/top-up';
import { formatMoney } from '@/lib/format';

export function WalletAddPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
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
    navigate(`/wallet/deposit/review?${params.toString()}`);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to={returnTo ?? '/wallet'} className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Add money</h1>
      </header>

      <p className="text-sm text-muted">
        {(topUpShortfall != null ? walletTopUpAddSubtitle(topUpShortfall) : null) ??
          'This money will be available to fund requests.'}
      </p>

      <TextField
        label={`Amount (${MARKET.currencySymbol})`}
        inputMode="numeric"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value.replace(/[^\d]/g, ''));
          setValidationError(null);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {WALLET.addMoneyAmounts.map((preset) => (
          <button
            key={preset}
            type="button"
            className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink"
            onClick={() => setAmount(String(preset))}
          >
            {formatMoney(preset, MARKET.currency)}
          </button>
        ))}
      </div>

      {validationError ? <InlineError message={validationError} /> : null}

      <Button label="Continue" disabled={!hasAmount} onClick={continueToReview} />
    </div>
  );
}
