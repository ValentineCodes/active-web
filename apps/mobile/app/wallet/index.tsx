import { useCallback, useMemo, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { type Href, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  WalletLockedFundsSheet,
  type WalletLockedFundsSheetHandle,
} from '@/components/wallet/WalletLockedFundsSheet';
import { WalletActivityRow as WalletActivityRowComponent } from '@/components/wallet/WalletActivityRow';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { WALLET } from '@/config';
import { useWalletLockedCommitments } from '@/features/wallet/locked-commitments';
import { useMyWallet, useWalletActivity } from '@/features/wallet/api';
import {
  enrichActivityWithWithdrawals,
  useMyWalletWithdrawals,
} from '@/features/wallet/withdrawals-api';
import type { WalletActivityRow } from '@/features/wallet/activity';
import { formatMoney } from '@/lib/format';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useColors } from '@/theme';

export default function WalletHomeScreen() {
  const colors = useColors();
  const wallet = useMyWallet();
  useQueryErrorToast(wallet);
  const activity = useWalletActivity();
  const withdrawals = useMyWalletWithdrawals();
  const lockedCommitments = useWalletLockedCommitments();
  const lockedSheetRef = useRef<WalletLockedFundsSheetHandle>(null);

  const { refetch: refetchWallet } = wallet;
  const { refetch: refetchActivity } = activity;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
      void refetchActivity();
      void withdrawals.refetch();
    }, [refetchWallet, refetchActivity, withdrawals]),
  );

  const onPullRefresh = useCallback(
    () => Promise.all([refetchWallet(), refetchActivity(), withdrawals.refetch()]),
    [refetchActivity, refetchWallet, withdrawals],
  );
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  const openLockedSheet = () => {
    lockedSheetRef.current?.present();
  };

  if (showQuerySkeleton(wallet)) {
    return (
      <Screen>
        <Header title="Wallet" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (!wallet.data) {
    return (
      <Screen>
        <Header title="Wallet" onBack={() => router.back()} />
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-5 pb-12"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <EmptyState
            icon="wallet-outline"
            title="Wallet unavailable"
            message="Pull to refresh when you are back online."
          />
        </ScrollView>
      </Screen>
    );
  }

  const { available, locked, pending, currency } = wallet.data;
  const total = available + locked + pending;
  const preview = useMemo(() => {
    const base = (activity.data ?? []).slice(0, WALLET.previewActivityCount);
    return enrichActivityWithWithdrawals(base, withdrawals.data ?? []) as WalletActivityRow[];
  }, [activity.data, withdrawals.data]);
  const hasLockedFunds = locked > 0 || pending > 0;

  return (
    <Screen>
      <Header title="Wallet" onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-12 pt-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="overflow-hidden rounded-3xl border border-hairline bg-elevated">
          <View className="gap-2 px-5 pb-4 pt-5">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Available
            </Text>
            <Text className="text-4xl font-bold text-ink">{formatMoney(available, currency)}</Text>
          </View>

          <View className="h-px bg-hairline" />

          <View className="flex-row">
            <View className="flex-1 gap-1 px-5 py-4">
              <Pressable
                onPress={hasLockedFunds ? openLockedSheet : undefined}
                accessibilityRole={hasLockedFunds ? 'button' : undefined}
                accessibilityLabel="About locked money"
                className="flex-row items-center gap-1 self-start active:opacity-80"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                  Locked
                </Text>
                {hasLockedFunds ? (
                  <Ionicons name="information-circle-outline" size={14} color={colors.subtle} />
                ) : null}
              </Pressable>
              <Text className="text-lg font-semibold text-ink">
                {formatMoney(locked + pending, currency)}
              </Text>
            </View>

            <View className="w-px bg-hairline" />

            <View className="flex-1 gap-1 px-5 py-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Total
              </Text>
              <Text className="text-lg font-semibold text-ink">{formatMoney(total, currency)}</Text>
            </View>
          </View>

          <View className="flex-row gap-3 border-t border-hairline p-4">
            <Button
              label="Add Money"
              variant="active"
              size="lg"
              corner="2xl"
              className="flex-1"
              onPress={() => router.push('/wallet/add')}
            />
            {available > 0 ? (
              <Button
                label="Withdraw"
                variant="secondary"
                size="lg"
                corner="2xl"
                className="flex-1"
                onPress={() => router.push('/wallet/withdraw' as Href)}
              />
            ) : null}
          </View>
          <Pressable
            onPress={() => router.push('/wallet/withdrawals' as Href)}
            accessibilityRole="button"
            accessibilityLabel="View withdrawal history"
            className="border-t border-hairline px-4 py-3 active:opacity-80"
          >
            <Text className="text-center text-sm font-semibold text-active">Withdrawal history</Text>
          </Pressable>
        </View>

        {hasLockedFunds ? (
          <Pressable
            onPress={openLockedSheet}
            accessibilityRole="button"
            accessibilityLabel="About locked money"
            className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3.5 active:opacity-90"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-warning-soft">
              <Ionicons name="time-outline" size={18} color={colors.warning} />
            </View>
            <Text className="flex-1 text-sm leading-5 text-muted">
              <Text className="font-semibold text-ink">
                {formatMoney(locked + pending, currency)}
              </Text>{' '}
              is locked because it&apos;s currently committed to an active request.
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
          </Pressable>
        ) : null}

        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-lg font-bold text-ink">Recent activity</Text>
            {(activity.data?.length ?? 0) > 0 ? (
              <Pressable
                onPress={() => router.push('/wallet/history')}
                accessibilityRole="button"
                accessibilityLabel="View all wallet activity"
                className="active:opacity-80"
              >
                <Text className="text-base font-semibold text-active">View all</Text>
              </Pressable>
            ) : null}
          </View>

          {activity.isError ? <InlineError error={activity.error} /> : null}

          {activity.isPending ? (
            <LoadingState />
          ) : preview.length === 0 ? (
            <EmptyState
              layout="list"
              icon="wallet-outline"
              title="No transactions yet"
              message="Money you add and payments for requests will show up here."
            />
          ) : (
            <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
              {preview.map((row, index) => (
                <WalletActivityRowComponent
                  key={row.id!}
                  row={row}
                  currency={currency}
                  showDivider={index > 0}
                  onPress={() => {
                    if (row.withdrawal?.withdrawalId) {
                      router.push(
                        `/wallet/withdrawal/${row.withdrawal.withdrawalId}` as Href,
                      );
                      return;
                    }
                    router.push(`/wallet/transaction/${row.id}` as Href);
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <WalletLockedFundsSheet
        ref={lockedSheetRef}
        lockedTotal={locked + pending}
        currency={currency}
        commitments={lockedCommitments.commitments}
      />
    </Screen>
  );
}
