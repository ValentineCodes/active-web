import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import {
  MAX_BANK_ACCOUNTS,
  normalizeAccountNumberInput,
  saveBankAccount,
  useMyBankAccounts,
  usePaystackBanks,
  type PaystackBankOption,
} from '@/features/profile/bank-accounts-api';
import { useBankAccountLookup } from '@/features/profile/use-bank-account-lookup';
import { readWalletReturnTo } from '@/features/wallet/deposit-navigation';
import { queryKeys } from '@/lib/query/keys';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

export function BankAccountAddPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = readWalletReturnTo(search.get('returnTo') ?? undefined);
  const accounts = useMyBankAccounts();
  const banks = usePaystackBanks();
  const queryClient = useQueryClient();

  const [selectedBank, setSelectedBank] = useState<PaystackBankOption | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const digits = normalizeAccountNumberInput(accountNumber);
  const lookup = useBankAccountLookup({ bankCode: selectedBank?.code ?? null, accountNumber: digits });

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedBank || !lookup.canSave) throw new Error('Resolve the account before saving.');
      return saveBankAccount({
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
        accountNumber: digits,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts });
      showAppToast('Bank account saved');
      navigate(returnTo ?? '/profile/bank-accounts', { replace: true });
    },
  });

  const atLimit = (accounts.data?.length ?? 0) >= MAX_BANK_ACCOUNTS;

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to={returnTo ?? '/profile/bank-accounts'} className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Add bank account</h1>
      </header>

      {atLimit ? (
        <p className="text-sm text-muted">Remove an account before adding another.</p>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Bank</span>
        <select
          className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-base text-ink"
          value={selectedBank?.code ?? ''}
          onChange={(e) => {
            const bank = (banks.data ?? []).find((b) => b.code === e.target.value) ?? null;
            setSelectedBank(bank);
          }}
        >
          <option value="">Select bank</option>
          {(banks.data ?? []).map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
      </label>

      <TextField
        label="Account number"
        inputMode="numeric"
        value={digits}
        maxLength={10}
        onChange={(e) => setAccountNumber(normalizeAccountNumberInput(e.target.value))}
      />

      {lookup.state.status === 'loading' ? <p className="text-sm text-subtle">Looking up account…</p> : null}
      {lookup.state.status === 'resolved' ? (
        <p className="text-sm font-semibold text-brand">{lookup.state.accountName}</p>
      ) : null}
      {lookup.state.status === 'not_found' || lookup.state.status === 'provider_error' ? (
        <InlineError message={lookup.state.message} onRetry={() => lookup.retry()} />
      ) : null}

      {save.isError ? <InlineError message={toUserMessage(save.error)} /> : null}

      <Button
        label="Save account"
        loading={save.isPending}
        disabled={!lookup.canSave || atLimit}
        onClick={() => save.mutate()}
      />
    </div>
  );
}
