import { useCallback } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { WalletActivityRow } from '@/components/wallet/WalletActivityRow';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useMyWallet, useWalletActivity } from '@/features/wallet/api';
import { groupWalletActivityByMonth } from '@/features/wallet/presentation';

export default function WalletHistoryScreen() {
  const wallet = useMyWallet();
  const activity = useWalletActivity();

  const { refetch: refetchWallet } = wallet;
  const { refetch: refetchActivity } = activity;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
      void refetchActivity();
    }, [refetchWallet, refetchActivity]),
  );

  if (wallet.isPending || activity.isPending) {
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

  if (activity.isError) {
    return (
      <Screen>
        <Header title="Transaction history" onBack={() => router.back()} />
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      </Screen>
    );
  }

  const currency = wallet.data.currency;
  const sections = groupWalletActivityByMonth(activity.data ?? []);

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-12 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching || activity.isRefetching}
            onRefresh={() => {
              void wallet.refetch();
              void activity.refetch();
            }}
          />
        }
      >
        <Header title="Transaction history" onBack={() => router.back()} />
        <Text className="-mt-1 mb-2 px-1 text-base text-muted">All wallet activity</Text>

        {sections.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="No activity yet"
            message="Deposits, payments for requests, refunds, and payouts appear here."
          />
        ) : (
          sections.map((section) => (
            <View key={section.key} className="gap-2">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                {section.title}
              </Text>
              <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
                {section.items.map((item, index) => (
                  <WalletActivityRow
                    key={item.id!}
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
      </ScrollView>
    </Screen>
  );
}
