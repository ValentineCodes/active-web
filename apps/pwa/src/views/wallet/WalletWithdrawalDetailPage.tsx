'use client';

import { useRouteParam } from '@/lib/route-param';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Card } from '@/components/ui/Card';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyWalletWithdrawal } from '@/features/wallet/withdrawals-api';
import { formatMoney } from '@/lib/format';
import { walletWithdrawalStatusLabel } from '@/features/wallet/withdraw-status';

export function WalletWithdrawalDetailPage() {
  const id = useRouteParam('id');
  const detail = useMyWalletWithdrawal(id);

  if (detail.isLoading) {
    return (
      <FlowScreen title="Withdrawal" backTo="/wallet">
        <LoadingState />
      </FlowScreen>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <FlowScreen title="Withdrawal" backTo="/wallet">
        <InlineError message={detail.error instanceof Error ? detail.error.message : 'Withdrawal not found.'} />
      </FlowScreen>
    );
  }

  const row = detail.data;
  const status = walletWithdrawalStatusLabel(row.status);

  return (
    <FlowScreen title="Withdrawal" backTo="/wallet" bodyClassName="flex flex-col gap-4">
      <Card tone="surface" className="shadow-card !p-5">
        <p className="text-2xl font-bold text-ink">{formatMoney(row.amountMajor, row.currency)}</p>
        <p className="mt-2 text-sm font-semibold text-brand">{status}</p>
        {row.userFacingReason ? <p className="mt-2 text-sm text-muted">{row.userFacingReason}</p> : null}
        <p className="mt-4 text-sm text-ink">
          {row.destinationBankName} · {row.destinationAccountNumberMasked}
        </p>
        <p className="text-xs text-subtle">{row.destinationAccountName}</p>
      </Card>
    </FlowScreen>
  );
}
