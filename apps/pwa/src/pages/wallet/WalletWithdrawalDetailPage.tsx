import { Link, useParams } from 'react-router-dom';

import { InlineError } from '@/components/ui/StateView';
import { useMyWalletWithdrawal } from '@/features/wallet/withdrawals-api';
import { formatMoney } from '@/lib/format';
import { walletWithdrawalStatusLabel } from '@/features/wallet/withdraw-status';

export function WalletWithdrawalDetailPage() {
  const { id = '' } = useParams();
  const detail = useMyWalletWithdrawal(id);

  if (detail.isLoading) return <p className="text-sm text-subtle">Loading…</p>;
  if (detail.isError || !detail.data) {
    return (
      <InlineError
        message={detail.error instanceof Error ? detail.error.message : 'Withdrawal not found.'}
      />
    );
  }

  const row = detail.data;
  const status = walletWithdrawalStatusLabel(row.status);

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/wallet" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Withdrawal</h1>
      </header>

      <section className="rounded-2xl border border-hairline bg-elevated p-5">
        <p className="text-2xl font-bold text-ink">{formatMoney(row.amountMajor, row.currency)}</p>
        <p className="mt-2 text-sm font-semibold text-brand">{status}</p>
        {row.userFacingReason ? <p className="mt-2 text-sm text-muted">{row.userFacingReason}</p> : null}
        <p className="mt-4 text-sm text-ink">
          {row.destinationBankName} · {row.destinationAccountNumberMasked}
        </p>
        <p className="text-xs text-subtle">{row.destinationAccountName}</p>
      </section>
    </div>
  );
}
