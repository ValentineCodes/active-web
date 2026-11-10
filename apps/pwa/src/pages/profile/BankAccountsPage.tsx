import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import {
  MAX_BANK_ACCOUNTS,
  useDeleteBankAccount,
  useMyBankAccounts,
  useSetDefaultBankAccount,
} from '@/features/profile/bank-accounts-api';
import { maskBankAccountNumber } from '@/features/profile/bank-account-display';
import { showAppToast } from '@/lib/toast';

export function BankAccountsPage() {
  const accounts = useMyBankAccounts();
  const setDefault = useSetDefaultBankAccount();
  const remove = useDeleteBankAccount();

  if (accounts.isLoading) return <p className="text-sm text-subtle">Loading…</p>;
  if (accounts.isError) {
    return (
      <InlineError
        message={accounts.error instanceof Error ? accounts.error.message : 'Could not load accounts.'}
      />
    );
  }

  const rows = accounts.data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Bank accounts</h1>
      </header>

      {rows.length >= MAX_BANK_ACCOUNTS ? (
        <p className="text-sm text-muted">You have the maximum number of saved accounts.</p>
      ) : (
        <Link to="/profile/bank-accounts/add" className="text-sm font-semibold text-brand">
          Add account
        </Link>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No accounts" description="Add a bank account to withdraw." />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.bank_account_id} className="rounded-2xl border border-hairline bg-elevated p-4">
              <p className="font-semibold text-ink">
                {row.bank_name}
                {row.is_default ? <span className="ml-2 text-xs text-brand">Default</span> : null}
              </p>
              <p className="text-sm text-muted">
                {maskBankAccountNumber(row.account_number)} · {row.account_name}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!row.is_default ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand"
                    onClick={() =>
                      void setDefault.mutateAsync(row.bank_account_id).then(() =>
                        showAppToast('Default account updated'),
                      )
                    }
                  >
                    Make default
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-xs font-semibold text-danger"
                  onClick={() =>
                    void remove.mutateAsync(row.bank_account_id).then(() => showAppToast('Account removed'))
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link to="/wallet">
        <Button label="Back to wallet" variant="secondary" onClick={() => undefined} />
      </Link>
    </div>
  );
}
