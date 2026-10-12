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
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { useMyWallet, useWalletActivityInfinite } from '@/features/wallet/api';
import { groupWalletActivityByMonth } from '@/features/wallet/presentation';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export default function WalletHistoryScreen() {
  const wallet = useMyWallet();
  const history = useWalletActivityInfinite();
  useQueryErrorToast(wallet);
  useQueryErrorToast(history);

  const { refetch: refetchWallet } = wallet;
  const { refetch: refetchHistory } = history;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
      void refetchHistory();
    }, [refetchWallet, refetchHistory]),
  );

  const onPullRefresh = useCallback(
    () => Promise.all([refetchWallet(), refetchHistory()]),
    [refetchHistory, refetchWallet],
  );
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  const rows = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data?.pages],
  );

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

  if (showQuerySkeleton(wallet) && showQuerySkeleton(history)) {
    return (
      <Screen>
        <Header title="Transaction history" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const currency = wallet.data?.currency ?? 'NGN';

  return (
    <Screen>
      <Header title="Transaction history" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pb-12 pt-1"
        contentContainerStyle={
          sections.length === 0 ? { flexGrow: 1, justifyContent: 'center' as const } : undefined
        }
        onScroll={onScroll}
        scrollEventThrottle={200}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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
