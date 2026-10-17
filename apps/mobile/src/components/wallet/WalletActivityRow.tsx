import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { WalletActivityRow as WalletActivityRowType } from '@/features/wallet/activity';
import { walletActivityListMeta } from '@/features/wallet/presentation';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type Props = {
  row: WalletActivityRowType;
  currency: string;
  onPress?: () => void;
  showDivider?: boolean;
};

export function WalletActivityRow({ row, currency, onPress, showDivider }: Props) {
  const colors = useColors();
  const meta = walletActivityListMeta(row, currency);
  const { visual } = meta;
  const iconBg = visual.incoming ? 'bg-active-soft' : 'bg-surface';
  const iconColor = visual.incoming ? colors.active : colors.muted;

  const content = (
    <>
      {showDivider ? <View className="ml-14 h-px bg-hairline" /> : null}
      <View className="flex-row items-center gap-3 py-4">
        <View className={cn('h-11 w-11 items-center justify-center rounded-full', iconBg)}>
          <Ionicons
            name={visual.incoming ? 'arrow-down' : 'arrow-up'}
            size={20}
            color={iconColor}
          />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">{meta.title}</Text>
          <View className="flex-row flex-wrap items-center gap-x-1.5">
            <Text className="text-sm text-muted">{meta.when}</Text>
            {visual.statusTag === 'locked' ? (
              <>
                <Text className="text-sm text-muted">·</Text>
                <Text className="text-sm font-medium text-warning">Locked</Text>
              </>
            ) : null}
            {visual.statusTag === 'returned' ? (
              <>
                <Text className="text-sm text-muted">·</Text>
                <Text className="text-sm font-medium text-active">Returned</Text>
              </>
            ) : null}
          </View>
        </View>

        {meta.signedAmount ? (
          <Text
            className={cn(
              'text-base font-semibold',
              meta.amount !== null && meta.amount > 0 ? 'text-active' : 'text-ink',
            )}
          >
            {meta.signedAmount}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meta.title}
      className="active:opacity-90"
    >
      {content}
    </Pressable>
  );
}

type HistoryListFooterProps = {
  loading: boolean;
  hasMore: boolean;
};

export function WalletHistoryListFooter({ loading, hasMore }: HistoryListFooterProps) {
  if (!loading && !hasMore) return null;

  return (
    <View className="items-center py-6">
      {loading ? <ActivityIndicator /> : null}
      {!loading && hasMore ? <Text className="text-sm text-muted">Scroll for more</Text> : null}
    </View>
  );
}
