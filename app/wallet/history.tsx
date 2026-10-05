import { useCallback, useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { WalletActivityRow, WalletHistoryListFooter } from '@/components/wallet/WalletActivityRow';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useMyWallet, useWalletActivityInfinite } from '@/features/wallet/api';
import { groupWalletActivityByMonth } from '@/features/wallet/presentation';

export default function WalletHistoryScreen() {
  const wallet = useMyWallet();
  const history = useWalletActivityInfinite();

  const { refetch: refetchWallet } = wallet;
  const { refetch: refetchHistory } = history;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
      void refetchHistory();
    }, [refetchWallet, refetchHistory]),
  );

  const rows = useMemo(() => history.data?.pages.flat() ?? [], [history.data?.pages]);

  const sections = useMemo(() => groupWalletActivityByMonth(rows), [rows]);

  const loadMore = useCallback(() => {
    if (!history.hasNextPage || history.isFetchingNextPage) return;
    void history.fetchNextPage();
  }, [history]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 240) loadMore();
    },
    [loadMore],
  );

  if (wallet.isPending && history.isPending) {
    return (
      <Screen>
        <Header title="Transaction history" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (wallet.isError) {
    return (
      <Screen>
        <Header title="Transaction history" onBack={() => router.back()} />
        <ErrorState error={wallet.error} onRetry={() => wallet.refetch()} />
      </Screen>
    );
  }

  if (history.isError) {
    return (
      <Screen>
        <Header title="Transaction history" onBack={() => router.back()} />
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      </Screen>
    );
  }

  const currency = wallet.data?.currency ?? 'NGN';

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-12 pt-2"
        contentContainerStyle={
          sections.length === 0 ? { flexGrow: 1, justifyContent: 'center' as const } : undefined
        }
        onScroll={onScroll}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching || history.isRefetching}
            onRefresh={() => {
              void wallet.refetch();
              void history.refetch();
            }}
          />
        }
      >
        <Header title="Transaction history" onBack={() => router.back()} />
        <Text className="-mt-1 mb-2 px-1 text-base text-muted">
          Money added, request payments, and refunds
        </Text>

        {sections.length === 0 ? (
          history.isPending ? (
            <LoadingState />
          ) : (
            <EmptyState
              layout="list"
              icon="wallet-outline"
              title="No transactions yet"
              message="Money you add and payments for requests will show up here."
            />
          )
        ) : (
          sections.map((section) => (
            <View key={section.key} className="gap-2">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                {section.title}
              </Text>
              <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
                {section.items.map((item, index) => (
                  <WalletActivityRow
                    key={item.id}
                    row={item}
                    currency={currency}
                    detailed
                    showDivider={index > 0}
                    onPress={() => router.push(`/wallet/transaction/${item.id}`)}
                  />
                ))}
              </View>
            </View>
          ))
        )}

        <WalletHistoryListFooter
          loading={history.isFetchingNextPage}
          hasMore={Boolean(history.hasNextPage)}
        />
      </ScrollView>
    </Screen>
  );
}
