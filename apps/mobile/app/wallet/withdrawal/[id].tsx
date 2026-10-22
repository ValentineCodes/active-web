import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { formatMoney } from '@/lib/format';
import { useMyWallet } from '@/features/wallet/api';
import {
  walletWithdrawalStatusDescription,
  walletWithdrawalStatusLabel,
  walletWithdrawalStatusTone,
} from '@/features/wallet/withdraw-status';
import { useMyWalletWithdrawal } from '@/features/wallet/withdrawals-api';
import { formatWalletTransactionWhen } from '@/features/wallet/presentation';
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

export default function WalletWithdrawalDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wallet = useMyWallet();
  const withdrawal = useMyWalletWithdrawal(id ?? '');
  useQueryErrorToast(wallet);
  useQueryErrorToast(withdrawal);

  useFocusEffect(
    useCallback(() => {
      void withdrawal.refetch();
      void wallet.refetch();
    }, [withdrawal, wallet]),
  );

  if (withdrawal.isPending || wallet.isPending) {
    return (
      <Screen>
        <Header title="Withdrawal" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (withdrawal.isError || !withdrawal.data) {
    return (
      <Screen>
        <Header title="Withdrawal" onBack={() => router.back()} />
        <EmptyState
          icon="receipt-outline"
          title="Withdrawal not found"
          message="It may still be loading or you may not have access."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const row = withdrawal.data;
  const currency = wallet.data?.currency ?? row.currency;
  const tone = walletWithdrawalStatusTone(row.status);
  const statusLabel = walletWithdrawalStatusLabel(row.status);

  const detailRows: { label: string; value: string }[] = [
    {
      label: 'Submitted',
      value: formatWalletTransactionWhen(row.createdAt),
    },
    {
      label: 'Bank',
      value: row.destinationBankName,
    },
    {
      label: 'Account',
      value: `${row.destinationAccountNumberMasked} · ${row.destinationAccountName}`,
    },
  ];

  if (row.processingAt) {
    detailRows.push({
      label: 'Processing started',
      value: formatWalletTransactionWhen(row.processingAt),
    });
  }
  if (row.completedAt) {
    detailRows.push({
      label: 'Completed',
      value: formatWalletTransactionWhen(row.completedAt),
    });
  }
  if (row.rejectedAt) {
    detailRows.push({
      label: 'Rejected',
      value: formatWalletTransactionWhen(row.rejectedAt),
    });
  }
  if (row.failedAt) {
    detailRows.push({
      label: 'Failed',
      value: formatWalletTransactionWhen(row.failedAt),
    });
  }

  return (
    <Screen>
      <Header title="Withdrawal" onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center px-4">
          <View className="mb-6 h-12 w-12 items-center justify-center rounded-full bg-surface">
            <Ionicons name="arrow-up" size={22} color={colors.muted} />
          </View>
          <Text className="text-4xl font-bold text-ink">
            − {formatMoney(row.amountMajor, currency)}
          </Text>
          <View
            className={cn(
              'mt-3 rounded-full px-3 py-1',
              tone === 'active' && 'bg-active-soft',
              tone === 'warning' && 'bg-warning-soft',
              tone === 'danger' && 'bg-danger-soft',
              tone === 'muted' && 'bg-surface',
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold',
                tone === 'active' && 'text-active',
                tone === 'warning' && 'text-warning',
                tone === 'danger' && 'text-danger',
                tone === 'muted' && 'text-muted',
              )}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        <View className="overflow-hidden rounded-2xl bg-elevated">
          {detailRows.map((item, index) => (
            <View key={item.label}>
              {index > 0 ? <View className="mx-4 h-px bg-hairline" /> : null}
              <DetailRow label={item.label} value={item.value} />
            </View>
          ))}
        </View>

        <View className="gap-2 rounded-2xl bg-elevated px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Status</Text>
          <Text className="text-base leading-6 text-muted">
            {walletWithdrawalStatusDescription(row.status)}
          </Text>
          {row.userFacingReason ? (
            <Text className="mt-2 text-base leading-6 text-ink">{row.userFacingReason}</Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
