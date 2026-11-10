'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { InlineError, EmptyState, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { useMyBankAccounts, type BankAccount } from '@/features/profile/bank-accounts-api';
import { useMyWallet } from '@/features/wallet/api';
import {
  bankAccountAddPathFromWithdraw,
  buildWithdrawReviewPath,
  readWithdrawDraftFromSearch,
} from '@/features/wallet/withdraw-navigation';
import { resolveWithdrawAmountLimits, validateWithdrawAmountMajor } from '@/features/wallet/withdraw-limits';
import { usePublicWithdrawalPolicy } from '@/features/wallet/withdraw-policy-api';
import { maskBankAccountNumber } from '@/features/profile/bank-account-display';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

function pickInitialBank(accounts: BankAccount[], preferredId: string | null): string | null {
  if (!accounts.length) return null;
  if (preferredId && accounts.some((a) => a.bank_account_id === preferredId)) return preferredId;
  return accounts.find((a) => a.is_default)?.bank_account_id ?? accounts[0]?.bank_account_id ?? null;
}

export function WalletWithdrawPage() {
  const router = useRouter();
  const search = useSearchParams();
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
  const validationError = wallet.data ? validateWithdrawAmountMajor(parsed, available, limits) : null;
  const disabled = policy.data?.withdrawalsEnabled === false;

  const selectedId = useMemo(() => {
    if (bankId && accounts.some((a) => a.bank_account_id === bankId)) return bankId;
    return pickInitialBank(accounts, draft.bankAccountId);
  }, [accounts, bankId, draft.bankAccountId]);

  if (wallet.isLoading || bankAccounts.isLoading) {
    return (
      <FlowScreen title="Withdraw" backTo="/wallet">
        <LoadingState />
      </FlowScreen>
    );
  }

  const continueToReview = () => {
    if (!selectedId || validationError || parsed <= 0) return;
    router.push(buildWithdrawReviewPath({ amount: String(parsed), bankAccountId: selectedId }));
  };

  return (
    <FlowScreen title="Withdraw" backTo="/wallet" bodyClassName="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Available: {formatMoney(available, currency)}. Only available balance can be withdrawn.
      </p>

      {disabled ? <InlineError message="Withdrawals are temporarily disabled." /> : null}

      <MoneyAmountInput
        accessibilityLabel="Withdrawal amount"
        value={amount}
        onChangeText={(v) => setAmount(v.replace(/[^\d]/g, ''))}
      />
      {validationError ? <InlineError message={validationError} /> : null}

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Bank account</p>
        {accounts.length === 0 ? (
          <EmptyState layout="list" icon="copy-outline" title="No bank account" message="Add an account to withdraw." />
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li key={account.bank_account_id}>
                <button
                  type="button"
                  className={cn(
                    'shadow-card w-full rounded-xl border px-4 py-3 text-left text-sm active:opacity-95',
                    selectedId === account.bank_account_id ? 'border-brand bg-brand/5' : 'border-hairline bg-elevated',
                  )}
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
        <Button
          label="Add bank account"
          variant="ghost"
          className="!w-auto self-start"
          onClick={() => router.push(bankAccountAddPathFromWithdraw({ amount, bankAccountId: selectedId }))}
        />
      </section>

      <Button
        label="Continue"
        disabled={!selectedId || parsed <= 0 || Boolean(validationError) || disabled}
        onClick={continueToReview}
      />
    </FlowScreen>
  );
}
