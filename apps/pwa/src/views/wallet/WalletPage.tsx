'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { WalletActivityRow } from '@/components/wallet/WalletActivityRow';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { WALLET } from '@/config/index';
import { useMyWallet, useWalletActivity, invalidateWalletQueries } from '@/features/wallet/api';
import type { WalletActivityRow as WalletActivityRowType } from '@/features/wallet/activity';
import {
  enrichActivityWithWithdrawals,
  useMyWalletWithdrawals,
} from '@/features/wallet/withdrawals-api';
import { formatMoney } from '@/lib/format';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useQueryClient } from '@tanstack/react-query';

export function WalletPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const wallet = useMyWallet();
  const activity = useWalletActivity();
  const withdrawals = useMyWalletWithdrawals();
  const preview = useMemo(() => {
    if (!wallet.data) return [];
    const base = (activity.data ?? []).slice(0, WALLET.previewActivityCount);
    return enrichActivityWithWithdrawals(base, withdrawals.data ?? []) as WalletActivityRowType[];
  }, [activity.data, wallet.data, withdrawals.data]);

  if (showQuerySkeleton(wallet)) {
    return (
      <FlowScreen title="Wallet" onBack={() => router.back()}>
        <LoadingState />
      </FlowScreen>
    );
  }

  if (wallet.isError || !wallet.data) {
    return (
      <FlowScreen title="Wallet" onBack={() => router.back()}>
        <EmptyState
          icon="notifications-outline"
          title="Wallet unavailable"
          message="Refresh when you are back online."
          action={{
            label: 'Try again',
            onPress: () => void invalidateWalletQueries(queryClient),
          }}
        />
      </FlowScreen>
    );
  }

  const { available, locked, pending, currency } = wallet.data;
  const total = available + locked + pending;
  const hasLockedFunds = locked > 0 || pending > 0;

  return (
    <FlowScreen title="Wallet" onBack={() => router.back()} bodyClassName="flex flex-col gap-6">
      <div className="overflow-hidden rounded-3xl border border-hairline bg-elevated">
        <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Available</p>
          <p className="text-4xl font-bold text-ink">{formatMoney(available, currency)}</p>
        </div>
        <WalletHairline />
        <div className="flex flex-row">
          <div className="flex flex-1 flex-col gap-1 px-5 py-4">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-subtle">
              Locked
              {hasLockedFunds ? (
                <IonIcon icon={ionIcons['information-circle-outline']} size={14} color="#8A948C" />
              ) : null}
            </p>
            <p className="text-lg font-semibold text-ink">{formatMoney(locked + pending, currency)}</p>
          </div>
          <WalletHairlineVertical />
          <div className="flex flex-1 flex-col gap-1 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Total</p>
            <p className="text-lg font-semibold text-ink">{formatMoney(total, currency)}</p>
          </div>
        </div>
        <WalletHairline />
        <div className="flex flex-row gap-3 border-t border-hairline p-4">
          <Button
            label="Add Money"
            variant="active"
            size="lg"
            corner="2xl"
            className="flex-1"
            onClick={() => router.push('/wallet/add')}
          />
          {available > 0 ? (
            <Button
              label="Withdraw"
              variant="secondary"
              size="lg"
              corner="2xl"
              className="flex-1"
              onClick={() => router.push('/wallet/withdraw')}
            />
          ) : null}
        </div>
      </div>

      {hasLockedFunds ? (
        <LockedNotice amount={formatMoney(locked + pending, currency)} />
      ) : null}

      <section className="flex flex-col gap-3">
        <span className="flex flex-row items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Recent activity</h2>
          {(activity.data?.length ?? 0) > 0 ? (
            <Link href="/wallet/history" className="text-base font-semibold text-active active:opacity-80">
              View all
            </Link>
          ) : null}
        </span>
        {activity.isError ? <InlineError error={activity.error} /> : null}
        {activity.isPending ? (
          <LoadingState />
        ) : preview.length === 0 ? (
          <EmptyState
            layout="list"
            icon="notifications-outline"
            title="No transactions yet"
            message="Money you add and payments for requests will show up here."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
            {preview.map((row, index) => (
              <WalletActivityRow
                key={row.id!}
                row={row}
                currency={currency}
                showDivider={index > 0}
                to={
                  row.withdrawal?.withdrawalId
                    ? `/wallet/withdrawal/${row.withdrawal.withdrawalId}`
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </FlowScreen>
  );
}

function WalletHairline() {
  return <div className="h-px bg-hairline" />;
}

function WalletHairlineVertical() {
  return <span className="w-px bg-hairline" aria-hidden />;
}

function LockedNotice({ amount }: { amount: string }) {
  return (
    <div className="flex flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft">
        <IonIcon icon={ionIcons['time-outline']} size={18} color="#B45309" />
      </span>
      <p className="flex-1 text-sm leading-5 text-muted">
        <span className="font-semibold text-ink">{amount}</span> is locked because it&apos;s committed to an active
        request.
      </p>
    </div>
  );
}
