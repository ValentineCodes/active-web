import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { RespondableRequest } from '@/features/requests/responses-api';
import { PersonRow } from '@/components/ui/PersonRow';
import { formatMoney, formatProximity, formatWhen, formatWhenDiscover } from '@/lib/format';
import { colors } from '@/theme';

type RequestHelpSummaryProps = {
  request: RespondableRequest;
  /** Use longer scheduling copy on detail (default). Cards use compact discover formatting elsewhere. */
  whenStyle?: 'detail' | 'discover';
};

/** Shared “what / how much / when / where (coarse)” block for respond detail. */
export function RequestHelpSummary({ request, whenStyle = 'detail' }: RequestHelpSummaryProps) {
  const whenText =
    whenStyle === 'discover'
      ? formatWhenDiscover(request.scheduled_for)
      : formatWhen(request.scheduled_for);

  const amount =
    request.offered_amount !== null ? formatMoney(request.offered_amount, request.currency) : null;

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="text-2xl font-bold uppercase tracking-wide text-ink">{request.title}</Text>
        {request.description ? (
          <Text className="text-base leading-6 text-muted">
            &ldquo;{request.description}&rdquo;
          </Text>
        ) : null}
      </View>

      {amount ? <Text className="text-3xl font-bold text-ink">{amount}</Text> : null}

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Ionicons name="time-outline" size={18} color={colors.subtle} />
          <Text className="text-base text-ink">{whenText}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Ionicons name="navigate-outline" size={18} color={colors.subtle} />
          <Text className="text-base text-ink">{formatProximity(request.distance_m)}</Text>
        </View>
        <View className="flex-row items-start gap-2">
          <Ionicons
            name="location-outline"
            size={18}
            color={colors.subtle}
            style={{ marginTop: 2 }}
          />
          <View className="flex-1 gap-0.5">
            <Text className="text-base text-ink">{request.location_label}</Text>
            <Text className="text-sm text-muted">
              General area — exact address after you are selected.
            </Text>
          </View>
        </View>
      </View>

      {request.requester_display_name ? (
        <View className="gap-2 border-t border-hairline pt-4">
          <Text className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Posted by
          </Text>
          <PersonRow
            avatarPath={request.requester_avatar_path}
            name={request.requester_display_name}
            ratingAverage={request.requester_rating_average}
            ratingCount={request.requester_rating_count ?? 0}
          />
        </View>
      ) : null}
    </View>
  );
}
