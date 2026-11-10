'use client';

import { useRouter } from 'next/navigation';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  MAX_BANK_ACCOUNTS,
  useDeleteBankAccount,
  useMyBankAccounts,
  useSetDefaultBankAccount,
} from '@/features/profile/bank-accounts-api';
import { maskBankAccountNumber } from '@/features/profile/bank-account-display';
import { showAppToast } from '@/lib/toast';

export function BankAccountsPage() {
  const router = useRouter();
  const accounts = useMyBankAccounts();
  const setDefault = useSetDefaultBankAccount();
  const remove = useDeleteBankAccount();

  if (accounts.isLoading) {
    return (
      <FlowScreen title="Bank accounts" backTo="/profile">
        <LoadingState />
      </FlowScreen>
    );
  }
  if (accounts.isError) {
    return (
      <FlowScreen title="Bank accounts" backTo="/profile">
        <InlineError message={accounts.error instanceof Error ? accounts.error.message : 'Could not load accounts.'} />
      </FlowScreen>
    );
  }

  const rows = accounts.data ?? [];

  return (
    <FlowScreen title="Bank accounts" backTo="/profile" bodyClassName="flex flex-col gap-4">
      {rows.length >= MAX_BANK_ACCOUNTS ? (
        <p className="text-sm text-muted">You have the maximum number of saved accounts.</p>
      ) : (
        <Button label="Add account" variant="ghost" className="!w-auto self-start" onClick={() => router.push('/profile/bank-accounts/add')} />
      )}

      {rows.length === 0 ? (
        <EmptyState layout="list" icon="copy-outline" title="No bank accounts" message="Add an account to withdraw earnings." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <Card key={row.bank_account_id} tone="surface" className="!gap-2 !p-4">
            <p className="text-base font-semibold text-ink">{row.bank_name}</p>
            <p className="text-sm text-muted">{maskBankAccountNumber(row.account_number)}</p>
            <p className="text-sm text-ink">{row.account_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {row.is_default ? <span className="text-xs font-semibold text-brand">Default</span> : null}
              {!row.is_default ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-brand"
                  onClick={() =>
                    void setDefault.mutateAsync(row.bank_account_id).then(() => showAppToast('Default account updated'))
                  }
                >
                  Make default
                </button>
              ) : null}
              <button
                type="button"
                className="text-xs font-semibold text-danger"
                onClick={() => void remove.mutateAsync(row.bank_account_id)}
              >
                Remove
              </button>
            </div>
          </Card>
        ))}
      </ul>
    </FlowScreen>
  );
}
