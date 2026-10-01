import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadow } from '@/theme';

type RequestOfferWhenCardProps = {
  amount: string;
  whenLabel: string;
  whenDetail?: string;
  locationLabel?: string;
};

/** Offer / when / location block from the request-flow mocks. */
export function RequestOfferWhenCard({
  amount,
  whenLabel,
  whenDetail,
  locationLabel,
}: RequestOfferWhenCardProps) {
  const showDetailRow = whenDetail !== undefined || locationLabel !== undefined;

  return (
    <View
      style={shadow.card}
      className="overflow-hidden rounded-2xl border border-hairline bg-elevated p-4"
    >
      {showDetailRow ? (
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Offer</Text>
            <Text className="text-3xl font-bold text-active">{amount}</Text>
          </View>
          <View className="h-px bg-hairline" />
          <View className="flex-row">
            <View className="flex-1 gap-1 pr-3">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="time-outline" size={14} color={colors.subtle} />
                <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                  When
                </Text>
              </View>
              <Text className="text-base font-semibold text-ink">{whenDetail ?? whenLabel}</Text>
            </View>
            {locationLabel ? (
              <>
                <View className="w-px bg-hairline" />
                <View className="flex-1 gap-1 pl-3">
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="navigate-outline" size={14} color={colors.subtle} />
                    <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                      Location
                    </Text>
                  </View>
                  <Text className="text-base font-semibold text-ink">{locationLabel}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <View className="flex-row">
          <View className="flex-1 gap-1 pr-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Offer</Text>
            <Text className="text-3xl font-bold text-active">{amount}</Text>
          </View>
          <View className="w-px bg-hairline" />
          <View className="flex-1 gap-1 pl-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">When</Text>
            <Text className="text-base font-semibold text-ink">{whenLabel}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
