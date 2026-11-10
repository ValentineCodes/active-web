import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { InlineError, EmptyState } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { useMyBankAccounts, type BankAccount } from '@/features/profile/bank-accounts-api';
import { useMyWallet } from '@/features/wallet/api';
import {
  bankAccountAddPathFromWithdraw,
  buildWithdrawReviewPath,
  readWithdrawDraftFromSearch,
} from '@/features/wallet/withdraw-navigation';
import {
  resolveWithdrawAmountLimits,
  validateWithdrawAmountMajor,
} from '@/features/wallet/withdraw-limits';
import { usePublicWithdrawalPolicy } from '@/features/wallet/withdraw-policy-api';
import { maskBankAccountNumber } from '@/features/profile/bank-account-display';
import { formatMoney } from '@/lib/format';

function pickInitialBank(accounts: BankAccount[], preferredId: string | null): string | null {
  if (!accounts.length) return null;
  if (preferredId && accounts.some((a) => a.bank_account_id === preferredId)) return preferredId;
  return accounts.find((a) => a.is_default)?.bank_account_id ?? accounts[0]?.bank_account_id ?? null;
}

export function WalletWithdrawPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const draft = readWithdrawDraftFromSearch(search);
  const wallet = useMyWallet();
  const bankAccounts = useMyBankAccounts();
  const policy = usePublicWithdrawalPolicy();

  const [amount, setAmount] = useState(draft.amount);
  const [bankId, setBankId] = useState<string | null>(null);

  const accounts = useMemo(() => bankAccounts.data ?? [], [bankAccounts.data]);
  const limits = resolveWithdrawAmountLimits(policy.data);
  const available = wallet.data?.available ?? 0;
  const currency = wallet.data?.currency ?? MARKET.currency;
  const parsed = Number(amount.replace(/[^\d]/g, ''));
  const validationError = wallet.data
    ? validateWithdrawAmountMajor(parsed, available, limits)
    : null;
  const disabled = policy.data?.withdrawalsEnabled === false;

  const selectedId = useMemo(() => {
    if (bankId && accounts.some((a) => a.bank_account_id === bankId)) return bankId;
    return pickInitialBank(accounts, draft.bankAccountId);
  }, [accounts, bankId, draft.bankAccountId]);

  if (wallet.isLoading || bankAccounts.isLoading) {
    return <p className="text-sm text-subtle">Loading…</p>;
  }

  const continueToReview = () => {
    if (!selectedId || validationError || parsed <= 0) return;
    navigate(buildWithdrawReviewPath({ amount: String(parsed), bankAccountId: selectedId }));
  };

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/wallet" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Withdraw</h1>
      </header>

      <p className="text-sm text-muted">
        Available: {formatMoney(available, currency)}. Only available balance can be withdrawn.
      </p>

      {disabled ? <InlineError message="Withdrawals are temporarily disabled." /> : null}

      <TextField
        label={`Amount (${MARKET.currencySymbol})`}
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
      />
      {validationError ? <InlineError message={validationError} /> : null}

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Bank account</p>
        {accounts.length === 0 ? (
          <EmptyState
            title="No bank account"
            description="Add an account to withdraw."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li key={account.bank_account_id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${
                    selectedId === account.bank_account_id
                      ? 'border-brand bg-brand/5'
                      : 'border-hairline bg-elevated'
                  }`}
                  onClick={() => setBankId(account.bank_account_id)}
                >
                  <p className="font-semibold text-ink">{account.bank_name}</p>
                  <p className="text-subtle">
                    {maskBankAccountNumber(account.account_number)} · {account.account_name}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link
          to={bankAccountAddPathFromWithdraw({ amount, bankAccountId: selectedId })}
          className="mt-3 inline-block text-sm font-semibold text-brand"
        >
          Add bank account
        </Link>
      </section>

      <Button
        label="Continue"
        disabled={!selectedId || parsed <= 0 || Boolean(validationError) || disabled}
        onClick={continueToReview}
      />
    </div>
  );
}
