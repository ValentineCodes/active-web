import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { confirmWalletWithdraw } from '@/lib/confirm';
import { showAppToast } from '@/lib/toast';
import { SERVICE_FEE_RATE, WALLET } from '@/config';
import {
  walletActivityAmount,
  walletActivitySignedLabel,
  walletActivityTitle,
} from '@/features/wallet/activity';
import {
  useMyWallet,
  useWalletActivity,
  useWalletTopUp,
  useWalletWithdraw,
} from '@/features/wallet/api';
import { formatAgo, formatMoney } from '@/lib/format';
import { colors } from '@/theme';

function BalanceRow({
  label,
  amount,
  currency,
  hint,
}: {
  label: string;
  amount: number;
  currency: string;
  hint?: string;
}) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-medium text-ink">{label}</Text>
        {hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
      </View>
      <Text className="text-base font-semibold text-ink">{formatMoney(amount, currency)}</Text>
    </View>
  );
}

export default function WalletScreen() {
  const wallet = useMyWallet();
  const activity = useWalletActivity();
  const topUp = useWalletTopUp();
  const withdraw = useWalletWithdraw();

  const { refetch: refetchWallet } = wallet;
  const { refetch: refetchActivity } = activity;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
      void refetchActivity();
    }, [refetchWallet, refetchActivity]),
  );

  if (wallet.isPending) {
    return (
      <Screen>
        <Header title="Wallet" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (wallet.isError) {
    return (
      <Screen>
        <Header title="Wallet" onBack={() => router.back()} />
        <ErrorState error={wallet.error} onRetry={() => wallet.refetch()} />
      </Screen>
    );
  }

  const { available, locked, pending, currency } = wallet.data;
  const feePercent = Math.round(SERVICE_FEE_RATE * 100);

  return (
    <Screen>
      <Header title="Wallet" onBack={() => router.back()} />

      <FlatList
        data={activity.data ?? []}
        keyExtractor={(item) => item.id!}
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching || activity.isRefetching}
            onRefresh={() => {
              void wallet.refetch();
              void activity.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <View className="gap-6">
            <Card className="gap-4 bg-brand-soft">
              <Text className="text-sm font-semibold text-brand">{WALLET.buckets.available}</Text>
              <Text className="text-4xl font-bold text-ink">
                {formatMoney(available, currency)}
              </Text>
              <Text className="text-sm text-muted">
                Use this balance to pay for requests. Active adds a {feePercent}% fee on top of your
                offer.
              </Text>
            </Card>

            <Card className="gap-4">
              <BalanceRow
                label={WALLET.buckets.locked}
                amount={locked}
                currency={currency}
                hint="Held while your request is open"
              />
              <View className="h-px bg-hairline" />
              <BalanceRow
                label={WALLET.buckets.pending}
                amount={pending}
                currency={currency}
                hint="Held after you choose someone, until the request completes or is refunded"
              />
            </Card>

            <Card className="gap-4">
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
                  <Text className="text-base font-semibold text-ink">Top up</Text>
                </View>
                <Text className="text-sm text-muted">
                  Temporary controls until a payment wallet is integrated. Balance updates on the
                  server only.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {WALLET.adjustAmounts.map((amount) => (
                    <Button
                      key={`top-up-${amount}`}
                      label={formatMoney(amount, currency)}
                      variant="secondary"
                      loading={topUp.isPending}
                      disabled={withdraw.isPending}
                      onPress={() =>
                        topUp.mutate(amount, {
                          onSuccess: () =>
                            showAppToast(`${formatMoney(amount, currency)} added to your balance`),
                        })
                      }
                    />
                  ))}
                </View>
              </View>

              <View className="h-px bg-hairline" />

              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="remove-circle-outline" size={20} color={colors.ink} />
                  <Text className="text-base font-semibold text-ink">Withdraw</Text>
                </View>
                <Text className="text-sm text-muted">Reduces available balance only.</Text>
                <View className="flex-row flex-wrap gap-2">
                  {WALLET.adjustAmounts.map((amount) => (
                    <Button
                      key={`withdraw-${amount}`}
                      label={formatMoney(amount, currency)}
                      variant="secondary"
                      loading={withdraw.isPending}
                      disabled={topUp.isPending || available < amount}
                      onPress={() =>
                        confirmWalletWithdraw(formatMoney(amount, currency), () =>
                          withdraw.mutate(amount, {
                            onSuccess: () =>
                              showAppToast(`${formatMoney(amount, currency)} withdrawn`, 'success'),
                          }),
                        )
                      }
                    />
                  ))}
                </View>
              </View>

              {topUp.isError || withdraw.isError ? (
                <InlineError error={topUp.error ?? withdraw.error} />
              ) : null}
            </Card>

            <View className="gap-1">
              <Text className="text-lg font-bold text-ink">Recent activity</Text>
              <Text className="text-sm text-muted">Money in and out of your wallet</Text>
            </View>

            {activity.isError ? <InlineError error={activity.error} /> : null}
          </View>
        }
        ListEmptyComponent={
          activity.isPending ? (
            <LoadingState />
          ) : (
            <EmptyState
              icon="wallet-outline"
              title="No activity yet"
              message="Deposits, payments for requests, refunds, and payouts appear here."
            />
          )
        }
        renderItem={({ item }) => {
          const amount = walletActivityAmount(item);
          const requestLink = item.request_id ? (
            <Pressable
              onPress={() => router.push(`/request/${item.request_id}`)}
              accessibilityRole="button"
              accessibilityLabel="Open related request"
            >
              <Text className="text-sm font-medium text-brand">View request</Text>
            </Pressable>
          ) : null;

          return (
            <Card className="gap-2">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold text-ink">
                    {walletActivityTitle(item.kind ?? 'activity')}
                  </Text>
                  {item.created_at ? (
                    <Text className="text-sm text-muted">{formatAgo(item.created_at)}</Text>
                  ) : null}
                </View>
                {amount !== null ? (
                  <Text
                    className={`text-base font-semibold ${amount >= 0 ? 'text-active' : 'text-ink'}`}
                  >
                    {walletActivitySignedLabel(amount)}
                  </Text>
                ) : null}
              </View>
              {requestLink}
            </Card>
          );
        }}
      />
    </Screen>
  );
}
