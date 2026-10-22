import { Pressable, Text, View } from 'react-native';

import type { MyWalletWithdrawal } from '@/features/wallet/withdrawals-api';
import {
  walletWithdrawalStatusLabel,
  walletWithdrawalStatusTone,
} from '@/features/wallet/withdraw-status';
import { formatWalletTransactionWhen } from '@/features/wallet/presentation';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

type Props = {
  row: MyWalletWithdrawal;
  currency: string;
  onPress: () => void;
  showDivider?: boolean;
};

export function WalletWithdrawalRow({ row, currency, onPress, showDivider }: Props) {
  const tone = walletWithdrawalStatusTone(row.status);
  const statusLabel = walletWithdrawalStatusLabel(row.status);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="active:opacity-90"
    >
      {showDivider ? <View className="ml-4 h-px bg-hairline" /> : null}
      <View className="gap-2 px-4 py-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-semibold text-ink">
              − {formatMoney(row.amountMajor, currency)}
            </Text>
            <Text className="text-sm text-muted" numberOfLines={1}>
              {row.destinationBankName} · {row.destinationAccountNumberMasked}
            </Text>
            <Text className="text-sm text-muted">
              Submitted {formatWalletTransactionWhen(row.createdAt)}
            </Text>
          </View>
          <View
            className={cn(
              'rounded-full px-2.5 py-1',
              tone === 'active' && 'bg-active-soft',
              tone === 'warning' && 'bg-warning-soft',
              tone === 'danger' && 'bg-danger-soft',
              tone === 'muted' && 'bg-surface',
            )}
          >
            <Text
              className={cn(
                'text-xs font-semibold',
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
        {row.userFacingReason && (row.status === 'rejected' || row.status === 'failed') ? (
          <Text className="text-sm leading-5 text-ink" numberOfLines={3}>
            {row.userFacingReason}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
