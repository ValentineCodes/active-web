import { Link } from 'react-router-dom';

import { EmptyState, InlineError } from '@/components/ui/StateView';
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

  if (activity.isError) {
    return (
      <InlineError
        message={activity.error instanceof Error ? activity.error.message : 'Could not load history.'}
      />
    );
  }

  const currency = wallet.data?.currency ?? 'NGN';

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/wallet" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Transaction history</h1>
      </header>

      {rows.length === 0 && !activity.isLoading ? (
        <EmptyState title="No transactions" description="Activity will show here." />
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const amount = walletActivityAmount(row);
          return (
            <li key={row.id} className="rounded-xl border border-hairline bg-elevated px-4 py-3">
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
    </div>
  );
}
