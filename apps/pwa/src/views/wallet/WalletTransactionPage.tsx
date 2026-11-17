'use client';

import Link from '@/components/AppLink';
import { useRouter } from '@/lib/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useEngagement } from '@/features/requests/requester-api';
import { walletActivityAmount, walletActivityTitle } from '@/features/wallet/activity';
import { useMyWallet, useWalletActivityInfinite } from '@/features/wallet/api';
import {
  enrichActivityWithWithdrawals,
  useMyWalletWithdrawals,
} from '@/features/wallet/withdrawals-api';
import type { WalletActivityRow } from '@/features/wallet/activity';
import {
  formatWalletActivitySignedAmount,
  formatWalletTransactionWhen,
  walletActivityReference,
  walletActivityVisual,
  walletActivityWhatHappened,
  walletHistoryDirection,
  walletTransactionDetailBadge,
  type WalletTransactionDetailBadge,
} from '@/features/wallet/presentation';
import { useRouteParam } from '@/lib/route-param';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme/ThemeProvider';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-row items-start justify-between gap-4 px-4 py-4">
      <span className="text-base text-muted">{label}</span>
      <span className="max-w-[58%] text-right text-base font-medium text-ink">{value}</span>
    </div>
  );
}

function TransactionStatusBadge({ badge }: { badge: WalletTransactionDetailBadge }) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-sm font-semibold',
        badge.variant === 'locked' && 'bg-warning-soft text-warning',
        (badge.variant === 'completed' || badge.variant === 'returned') && 'bg-active-soft text-active',
        badge.variant === 'pending' && 'bg-surface text-muted',
        badge.variant === 'failed' && 'bg-danger-soft text-danger',
      )}
    >
      {badge.label}
    </span>
  );
}

export function WalletTransactionPage() {
  const router = useRouter();
  const colors = useColors();
  const id = useRouteParam('id');
  const wallet = useMyWallet();
  const history = useWalletActivityInfinite();
  const withdrawals = useMyWalletWithdrawals();
  const notifiedNotFound = useRef(false);

  const item = useMemo(() => {
    const base = history.data?.pages.flatMap((page) => page.items) ?? [];
    const rows = enrichActivityWithWithdrawals(base, withdrawals.data ?? []) as WalletActivityRow[];
    return rows.find((row) => row.id === id);
  }, [history.data?.pages, withdrawals.data, id]);

  const engagement = useEngagement(item?.request_id ?? '', Boolean(item?.request_id));

  useEffect(() => {
    if (wallet.isPending || history.isPending) return;
    if (wallet.isError || history.isError) return;
    if (item?.id) return;
    if (notifiedNotFound.current) return;
    notifiedNotFound.current = true;
    showAppToast('Transaction not found', { type: 'warning' });
  }, [history.isError, history.isPending, item?.id, wallet.isError, wallet.isPending]);

  if ((wallet.isPending && history.isPending) || !id) {
    return (
      <FlowScreen title="Transaction" onBack={() => router.back()}>
        <LoadingState />
      </FlowScreen>
    );
  }

  if (!item?.id) {
    return (
      <FlowScreen title="Transaction" onBack={() => router.back()}>
        <EmptyState
          icon="receipt-outline"
          title="Transaction not found"
          message="It may have been removed or is still loading."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </FlowScreen>
    );
  }

  const currency = wallet.data?.currency ?? 'NGN';
  const kind = item.kind ?? 'activity';
  const amount = walletActivityAmount(item);
  const visual = walletActivityVisual(kind, amount);
  const direction = walletHistoryDirection(item.available_delta);
  const requestTitle = engagement.data?.title ?? null;
  const badge = walletTransactionDetailBadge(kind, item.status, item.withdrawal?.queueStatus);

  const detailRows: { label: string; value: string }[] = [];
  if (item.created_at) {
    detailRows.push({
      label: 'Date and time',
      value: formatWalletTransactionWhen(item.created_at),
    });
  }
  detailRows.push({
    label: 'Reference',
    value: walletActivityReference(item.id),
  });
  if (requestTitle) {
    detailRows.push({ label: 'Request', value: `“${requestTitle}”` });
  }
  if (item.withdrawal) {
    if (item.withdrawal.completedAt) {
      detailRows.push({
        label: 'Completed',
        value: formatWalletTransactionWhen(item.withdrawal.completedAt),
      });
    }
    if (item.withdrawal.userFacingReason) {
      detailRows.push({ label: 'Note', value: item.withdrawal.userFacingReason });
    }
  }

  return (
    <FlowScreen title="Transaction" onBack={() => router.back()} bodyClassName="flex flex-col gap-5">
      <div className="flex flex-col items-center px-4">
        <div
          className={cn(
            'mb-6 flex h-12 w-12 items-center justify-center rounded-full',
            visual.incoming ? 'bg-active-soft' : 'bg-surface',
          )}
        >
          <IonIcon
            icon={visual.incoming ? ionIcons['arrow-down'] : ionIcons['arrow-up']}
            size={22}
            color={visual.incoming ? colors.active : colors.muted}
          />
        </div>

        {amount !== null ? (
          <p className={cn('text-4xl font-bold', direction === 'in' ? 'text-active' : 'text-ink')}>
            {formatWalletActivitySignedAmount(amount, currency)}
          </p>
        ) : null}

        <p className="mt-3 text-lg font-semibold text-ink">{walletActivityTitle(kind)}</p>
        <div className="mt-3">
          <TransactionStatusBadge badge={badge} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-elevated">
        {detailRows.map((row, index) => (
          <div key={row.label}>
            {index > 0 ? <div className="mx-4 h-px bg-hairline" /> : null}
            <DetailRow label={row.label} value={row.value} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-elevated px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">What happened</p>
        <p className="text-base leading-6 text-muted">{walletActivityWhatHappened(kind)}</p>
      </div>

      {item.withdrawal?.withdrawalId ? (
        <Link
          href={`/wallet/withdrawal/${item.withdrawal.withdrawalId}`}
          className="rounded-2xl border border-hairline bg-elevated px-4 py-4 text-base font-semibold text-active active:opacity-90"
        >
          View withdrawal details
        </Link>
      ) : null}
    </FlowScreen>
  );
}