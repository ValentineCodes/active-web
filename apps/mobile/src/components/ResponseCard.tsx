import { Text, View } from 'react-native';

import { ResponderScheduleAvailability } from '@/components/ResponderScheduleAvailability';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { Badge } from '@/components/ui/Badge';
import { formatAgo, formatMoney } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Someone's response to a request, as the requester sees it before they choose.
 */
export function ResponseCard({
  displayName,
  avatarPath,
  ratingAverage,
  ratingCount,
  completionPercent,
  identityVerified = false,
  onViewProfile,
  message,
  quotedAmount,
  currency,
  createdAt,
  responderAvailable,
  onDiscussPress,
  discussLoading,
  statusLabel,
  statusTone,
}: {
  displayName: string | null;
  avatarPath: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  identityVerified?: boolean;
  onViewProfile: () => void;
  message: string | null;
  quotedAmount: number | null;
  currency: string;
  createdAt: string;
  responderAvailable: boolean;
  onDiscussPress?: () => void;
  discussLoading?: boolean;
  statusLabel?: string;
  statusTone?: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';
}) {
  const { shadow } = useTheme();
  const offerLabel = quotedAmount !== null ? formatMoney(quotedAmount, currency) : null;

  return (
    <View style={shadow.card} className="gap-4 rounded-2xl border border-hairline bg-elevated p-4">
      <View className="gap-2">
        {statusLabel ? <Badge label={statusLabel} tone={statusTone ?? 'neutral'} /> : null}
        <RequestPersonCard
          avatarPath={avatarPath}
          name={displayName}
          ratingAverage={ratingAverage}
          ratingCount={ratingCount}
          completionPercent={completionPercent}
          identityVerified={identityVerified}
          onPress={onViewProfile}
          onDiscussPress={onDiscussPress}
          discussLoading={discussLoading}
        />
      </View>

      {message || offerLabel ? (
        <View className="gap-2 rounded-2xl bg-surface p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm text-muted">{formatAgo(createdAt)}</Text>
            {offerLabel ? (
              <Text className="text-base font-bold text-active">{offerLabel}</Text>
            ) : null}
          </View>
          {message ? <Text className="text-base leading-6 text-ink">{message}</Text> : null}
        </View>
      ) : null}

      <ResponderScheduleAvailability available={responderAvailable} />
    </View>
  );
}
