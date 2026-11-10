'use client';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { Button } from '@/components/ui/Button';
import { useMyWallet, useWalletActivityInfinite } from '@/features/wallet/api';
import {
  enrichActivityWithWithdrawals,
  useMyWalletWithdrawals,
} from '@/features/wallet/withdrawals-api';
import {
  formatWalletActivitySignedAmount,
  formatWalletActivityWhen,
} from '@/features/wallet/presentation';
import { walletActivityAmount, walletActivityTitle } from '@/features/wallet/activity';

export function WalletHistoryPage() {
  const wallet = useMyWallet();
  const activity = useWalletActivityInfinite();
  const withdrawals = useMyWalletWithdrawals();

  const rows = enrichActivityWithWithdrawals(
    activity.data?.pages.flatMap((p) => p.items) ?? [],
    withdrawals.data ?? [],
  );

  const currency = wallet.data?.currency ?? 'NGN';

  if (activity.isError) {
    return (
      <FlowScreen title="Transaction history" backTo="/wallet">
        <InlineError message={activity.error instanceof Error ? activity.error.message : 'Could not load history.'} />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title="Transaction history" backTo="/wallet" bodyClassName="flex flex-col gap-4">
      {activity.isLoading ? <LoadingState label="Loading…" /> : null}
      {rows.length === 0 && !activity.isLoading ? (
        <EmptyState layout="list" icon="time-outline" title="No transactions" message="Activity will show here." />
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const amount = walletActivityAmount(row);
          return (
            <li key={row.id} className="shadow-card rounded-xl border border-hairline bg-elevated px-4 py-3">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{walletActivityTitle(row.kind)}</p>
                  <p className="text-xs text-subtle">{formatWalletActivityWhen(row.created_at)}</p>
                </div>
                {amount != null ? (
                  <p className="text-sm font-semibold text-ink">
                    {formatWalletActivitySignedAmount(amount, currency)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {activity.hasNextPage ? (
        <Button
          label={activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
          variant="secondary"
          disabled={activity.isFetchingNextPage}
          onClick={() => void activity.fetchNextPage()}
        />
      ) : null}
    </FlowScreen>
  );
}
