import { useCallback } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { type Href, router, useFocusEffect } from 'expo-router';

import { WalletWithdrawalRow } from '@/components/wallet/WalletWithdrawalRow';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyWallet } from '@/features/wallet/api';
import { useMyWalletWithdrawals } from '@/features/wallet/withdrawals-api';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';

export default function WalletWithdrawalsScreen() {
  const wallet = useMyWallet();
  const withdrawals = useMyWalletWithdrawals();
  useQueryErrorToast(wallet);
  useQueryErrorToast(withdrawals);

  useFocusEffect(
    useCallback(() => {
      void wallet.refetch();
      void withdrawals.refetch();
    }, [wallet, withdrawals]),
  );

  const onPullRefresh = useCallback(
    () => Promise.all([wallet.refetch(), withdrawals.refetch()]),
    [wallet, withdrawals],
  );
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  const currency = wallet.data?.currency ?? 'NGN';
  const rows = withdrawals.data ?? [];

  return (
    <Screen>
      <Header title="Withdrawals" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pb-12 pt-1"
        contentContainerStyle={
          rows.length === 0 && !withdrawals.isPending
            ? { flexGrow: 1, justifyContent: 'center' as const }
            : undefined
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {withdrawals.isError ? (
          <View className="gap-3">
            <InlineError error={withdrawals.error} />
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void withdrawals.refetch()}
            />
          </View>
        ) : null}

        {withdrawals.isPending && rows.length === 0 ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState
            layout="list"
            icon="arrow-up-circle-outline"
            title="No withdrawals yet"
            message="When you withdraw to your bank account, each request will appear here with its status."
            action={{
              label: 'Withdraw',
              onPress: () => router.push('/wallet/withdraw' as Href),
            }}
          />
        ) : (
          <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
            {rows.map((row, index) => (
              <WalletWithdrawalRow
                key={row.withdrawalId}
                row={row}
                currency={currency}
                showDivider={index > 0}
                onPress={() =>
                  router.push(`/wallet/withdrawal/${row.withdrawalId}` as Href)
                }
              />
            ))}
          </View>
        )}

        {rows.length > 0 ? (
          <Text className="px-1 text-center text-xs leading-5 text-muted">
            Status updates when our team processes your payout. Pull to refresh if you are back
            online.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
