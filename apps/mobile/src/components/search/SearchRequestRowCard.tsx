import { Pressable, Text, View } from 'react-native';

import type { SearchRequestRow } from '@/features/search/discovery-types';
import { formatMoney, formatProximity } from '@/lib/format';

export function SearchRequestRowCard({
  request,
  onPress,
}: {
  request: SearchRequestRow;
  onPress: () => void;
}) {
  const proximity =
    request.distance_m != null ? formatProximity(request.distance_m) : request.location_label;
  const offer =
    request.offered_amount != null && request.currency
      ? formatMoney(request.offered_amount, request.currency)
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={request.title}
      className="rounded-2xl border border-hairline bg-elevated p-3 active:opacity-90"
    >
      <Text className="text-base font-semibold text-ink" numberOfLines={2}>
        {request.title}
      </Text>
      <View className="mt-1 gap-0.5">
        {proximity ? <Text className="text-sm text-muted">{proximity}</Text> : null}
        {offer ? <Text className="text-sm font-medium text-ink">{offer}</Text> : null}
        {request.requester_display_name ? (
          <Text className="text-sm text-muted">{request.requester_display_name}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}