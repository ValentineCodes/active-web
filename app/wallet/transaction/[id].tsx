import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { useEngagement } from '@/features/requests/requester-api';
import { walletActivityAmount, walletActivityTitle } from '@/features/wallet/activity';
import { useMyWallet, useWalletActivityInfinite } from '@/features/wallet/api';
import {
  formatWalletActivitySignedAmount,
  formatWalletTransactionWhen,
  walletActivityReference,
  walletActivityVisual,
  walletHistoryDescription,
  walletHistoryDirection,
  walletTransactionStatusDisplay,
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

export default function WalletTransactionScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wallet = useMyWallet();
  const history = useWalletActivityInfinite();
  const item = history.data?.pages.flat().find((row) => row.id === id);
  const engagement = useEngagement(item?.request_id ?? '');

  if (wallet.isPending && history.isPending) {
    return (
      <Screen>
        <Header title="Transaction" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (wallet.isError) {
    return (
      <Screen>
        <Header title="Transaction" onBack={() => router.back()} />
        <ErrorState error={wallet.error} onRetry={() => wallet.refetch()} />
      </Screen>
    );
  }

  if (history.isError) {
    return (
      <Screen>
        <Header title="Transaction" onBack={() => router.back()} />
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      </Screen>
    );
  }

  if (!item || !item.id) {
    return (
      <Screen>
        <Header title="Transaction" onBack={() => router.back()} />
        <ErrorState error={new Error('Transaction not found')} onRetry={() => history.refetch()} />
      </Screen>
    );
  }

  const currency = wallet.data?.currency ?? 'NGN';
  const kind = item.kind ?? 'activity';
  const amount = walletActivityAmount(item);
  const visual = walletActivityVisual(kind, amount);
  const direction = walletHistoryDirection(item.available_delta);
  const requestTitle = engagement.data?.title ?? null;

  return (
    <Screen>
      <Header title="Transaction" onBack={() => router.back()} />

      <View className="flex-1 gap-6 px-5 pb-8 pt-4">
        <View className="items-center gap-3 px-4">
          <View
            className={cn(
              'h-12 w-12 items-center justify-center rounded-full',
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

          <Text className="text-lg font-semibold text-ink">{walletActivityTitle(kind)}</Text>
          <Text className="text-center text-base leading-6 text-muted">
            {walletHistoryDescription(item)}
          </Text>
        </View>

        <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
          <DetailRow label="Status" value={walletTransactionStatusDisplay(item.status)} />
          <View className="mx-4 h-px bg-hairline" />
          {item.created_at ? (
            <>
              <DetailRow
                label="Date and time"
                value={formatWalletTransactionWhen(item.created_at)}
              />
              <View className="mx-4 h-px bg-hairline" />
            </>
          ) : null}
          {requestTitle ? (
            <>
              <DetailRow label="Request" value={`“${requestTitle}”`} />
              <View className="mx-4 h-px bg-hairline" />
            </>
          ) : null}
          <DetailRow label="Support reference" value={walletActivityReference(item.id)} />
        </View>
      </View>

      <View className="px-5 pb-8">
        <Button
          label="Done"
          variant="active"
          size="lg"
          corner="2xl"
          className="w-full"
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}
