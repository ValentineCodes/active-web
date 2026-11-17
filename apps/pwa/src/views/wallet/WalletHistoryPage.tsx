'use client';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { WalletActivityRow } from '@/components/wallet/WalletActivityRow';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { Button } from '@/components/ui/Button';
import { useMyWallet, useWalletActivityInfinite } from '@/features/wallet/api';
import {
  enrichActivityWithWithdrawals,
  useMyWalletWithdrawals,
} from '@/features/wallet/withdrawals-api';
import type { WalletActivityRow as WalletActivityRowType } from '@/features/wallet/activity';
import { groupWalletActivityByMonth } from '@/features/wallet/presentation';
import { walletActivityHref } from '@/lib/wallet-navigation';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useMemo } from 'react';

export function WalletHistoryPage() {
  const wallet = useMyWallet();
  const activity = useWalletActivityInfinite();
  const withdrawals = useMyWalletWithdrawals();

  const rows = useMemo(() => {
    const base = activity.data?.pages.flatMap((page) => page.items) ?? [];
    return enrichActivityWithWithdrawals(base, withdrawals.data ?? []) as WalletActivityRowType[];
  }, [activity.data?.pages, withdrawals.data]);

  const sections = useMemo(() => groupWalletActivityByMonth(rows), [rows]);

  const currency = wallet.data?.currency ?? 'NGN';

  if (showQuerySkeleton(wallet) && showQuerySkeleton(activity)) {
    return (
      <FlowScreen title="Transaction history" backTo="/wallet">
        <LoadingState />
      </FlowScreen>
    );
  }

  if (activity.isError) {
    return (
      <FlowScreen title="Transaction history" backTo="/wallet">
        <InlineError message={activity.error instanceof Error ? activity.error.message : 'Could not load history.'} />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title="Transaction history" backTo="/wallet" bodyClassName="flex flex-col gap-4">
      {sections.length === 0 ? (
        activity.isPending ? (
          <LoadingState />
        ) : (
          <EmptyState
            layout="list"
            icon="wallet-outline"
            title="No transactions yet"
            message="Deposits and payments for requests will show up here."
          />
        )
      ) : (
        sections.map((section) => (
          <section key={section.key} className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{section.title}</h2>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
              {section.items.map((item, index) => (
                <WalletActivityRow
                  key={item.id}
                  row={item}
                  currency={currency}
                  showDivider={index > 0}
                  to={walletActivityHref(item)}
                />
              ))}
            </div>
          </section>
        ))
      )}

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