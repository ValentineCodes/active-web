import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { clearWithdrawNavigationState } from '@/features/wallet/withdraw-navigation';

export function WalletWithdrawResultPage() {
  const [search] = useSearchParams();
  const message = search.get('message') ?? 'Withdrawal submitted.';
  const withdrawalId = search.get('withdrawalId');

  const done = () => {
    clearWithdrawNavigationState();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <section className="rounded-2xl bg-surface p-6 text-center">
        <h2 className="text-lg font-semibold text-ink">Withdrawal requested</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {withdrawalId ? <p className="mt-2 text-xs text-subtle">Reference: {withdrawalId}</p> : null}
      </section>
      <Link to="/wallet" onClick={done}>
        <Button label="Back to wallet" onClick={done} />
      </Link>
      {withdrawalId ? (
        <Link
          to={`/wallet/withdrawal/${withdrawalId}`}
          className="text-center text-sm font-semibold text-brand"
        >
          View status
        </Link>
      ) : null}
    </div>
  );
}
