import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { showAppToast } from '@/lib/toast';
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
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 px-4 py-4">
      <Text className="text-base text-muted">{label}</Text>
      <Text className="max-w-[58%] text-right text-base font-medium text-ink">{value}</Text>
    </View>
  );
}

function TransactionStatusBadge({ badge }: { badge: WalletTransactionDetailBadge }) {
  return (
    <View
      className={cn(
        'rounded-full px-3 py-1',
        badge.variant === 'locked' && 'bg-warning-soft',
        (badge.variant === 'completed' || badge.variant === 'returned') && 'bg-active-soft',
        badge.variant === 'pending' && 'bg-surface',
        badge.variant === 'failed' && 'bg-danger-soft',
      )}
    >
      <Text
        className={cn(
          'text-sm font-semibold',
          badge.variant === 'locked' && 'text-warning',
          (badge.variant === 'completed' || badge.variant === 'returned') && 'text-active',
          badge.variant === 'pending' && 'text-muted',
          badge.variant === 'failed' && 'text-danger',
        )}
      >
        {badge.label}
      </Text>
    </View>
  );
}

export default function WalletTransactionScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wallet = useMyWallet();
  const history = useWalletActivityInfinite();
  const withdrawals = useMyWalletWithdrawals();
  useQueryErrorToast(wallet);
  useQueryErrorToast(history);
  useQueryErrorToast(withdrawals);
  const item = useMemo(() => {
    const base = history.data?.pages.flatMap((page) => page.items) ?? [];
    const rows = enrichActivityWithWithdrawals(base, withdrawals.data ?? []) as WalletActivityRow[];
    return rows.find((row) => row.id === id);
  }, [history.data?.pages, withdrawals.data, id]);
  const engagement = useEngagement(item?.request_id ?? '');
  const notifiedNotFound = useRef(false);

  useEffect(() => {
    if (wallet.isPending || history.isPending) return;
    if (wallet.isError || history.isError) return;
    if (item?.id) return;
    if (notifiedNotFound.current) return;
    notifiedNotFound.current = true;
    showAppToast('Transaction not found', 'warning');
  }, [history.isError, history.isPending, item?.id, wallet.isError, wallet.isPending]);

  if (wallet.isPending && history.isPending) {
    return (
      <Screen>
        <Header title="Transaction" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (!item?.id) {
    return (
      <Screen>
        <Header title="Transaction" onBack={() => router.back()} />
        <EmptyState
          icon="receipt-outline"
          title="Transaction not found"
          message="It may have been removed or is still loading."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
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
    <Screen>
      <Header title="Transaction" onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center px-4">
          <View
            className={cn(
              'mb-6 h-12 w-12 items-center justify-center rounded-full',
              visual.incoming ? 'bg-active-soft' : 'bg-surface',
            )}
          >
            <Ionicons
              name={visual.incoming ? 'arrow-down' : 'arrow-up'}
              size={22}
              color={visual.incoming ? colors.active : colors.muted}
            />
          </View>

          {amount !== null ? (
            <Text
              className={cn('text-4xl font-bold', direction === 'in' ? 'text-active' : 'text-ink')}
            >
              {formatWalletActivitySignedAmount(amount, currency)}
            </Text>
          ) : null}

          <Text className="mt-3 text-lg font-semibold text-ink">{walletActivityTitle(kind)}</Text>
          <View className="mt-3">
            <TransactionStatusBadge badge={badge} />
          </View>
        </View>

        <View className="overflow-hidden rounded-2xl bg-elevated">
          {detailRows.map((row, index) => (
            <View key={row.label}>
              {index > 0 ? <View className="mx-4 h-px bg-hairline" /> : null}
              <DetailRow label={row.label} value={row.value} />
            </View>
          ))}
        </View>

        <View className="gap-2 rounded-2xl bg-elevated px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
            What happened
          </Text>
          <Text className="text-base leading-6 text-muted">{walletActivityWhatHappened(kind)}</Text>
        </View>

        {item.withdrawal?.withdrawalId ? (
          <Pressable
            onPress={() =>
              router.push(`/wallet/withdrawal/${item.withdrawal!.withdrawalId}` as Href)
            }
            accessibilityRole="button"
            className="rounded-2xl border border-hairline bg-elevated px-4 py-4 active:opacity-90"
          >
            <Text className="text-base font-semibold text-active">View withdrawal details</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
