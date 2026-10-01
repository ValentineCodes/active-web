import { Text, View } from 'react-native';

import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { formatAgo, formatMoney } from '@/lib/format';
import { shadow } from '@/theme';

/**
 * Someone's response to a request, as the requester sees it before they choose.
 */
export function ResponseCard({
  displayName,
  avatarPath,
  ratingAverage,
  ratingCount,
  completionPercent,
  onViewProfile,
  message,
  quotedAmount,
  currency,
  createdAt,
  responderAvailable,
}: {
  displayName: string | null;
  avatarPath: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  onViewProfile: () => void;
  message: string | null;
  quotedAmount: number | null;
  currency: string;
  createdAt: string;
  responderAvailable: boolean;
}) {
  const offerLabel = quotedAmount !== null ? formatMoney(quotedAmount, currency) : null;

  return (
    <View style={shadow.card} className="gap-4 rounded-2xl border border-hairline bg-elevated p-4">
      <RequestPersonCard
        avatarPath={avatarPath}
        name={displayName}
        ratingAverage={ratingAverage}
        ratingCount={ratingCount}
        completionPercent={completionPercent}
        onPress={onViewProfile}
      />

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

      {!responderAvailable ? (
        <Text className="text-sm text-muted">
          This person is currently attending to another request.
        </Text>
      ) : null}
    </View>
  );
}
