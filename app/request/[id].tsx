import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { StarRating } from '@/components/ui/Stars';
import { useCategoryIndex } from '@/features/categories/api';
import {
  useAcceptResponse,
  useCancelRequest,
  useDeclineResponse,
  useExpandRadius,
  useLiveRequest,
  useMyRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import { requestStatusBadge } from '@/features/requests/status';
import { formatAgo, formatDistance, formatMoney, formatRadius, formatWhen } from '@/lib/format';
import { colors } from '@/theme';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const request = useMyRequest(id);
  const responses = useRequestResponses(id);
  const categories = useCategoryIndex();

  const expandRadius = useExpandRadius(id);
  const cancelRequest = useCancelRequest(id);
  const acceptResponse = useAcceptResponse(id);
  const declineResponse = useDeclineResponse(id);

  useLiveRequest(id);

  if (request.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (request.isError) {
    return (
      <Screen>
        <ErrorState error={request.error} onRetry={() => request.refetch()} />
      </Screen>
    );
  }

  const { data } = request;
  const badge = requestStatusBadge(data.status, data.pending_response_count);
  const category = categories.data?.get(data.category_slug);
  const pending = responses.data?.filter((response) => response.status === 'pending') ?? [];
  const isSearching = data.status === 'searching';
  const isConnected = ['accepted', 'in_progress'].includes(data.status);

  const confirmCancel = () =>
    Alert.alert('Cancel this request?', 'Anyone who responded will be told it is no longer open.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () => cancelRequest.mutate(),
      },
    ]);

  return (
    <Screen>
      <View className="flex-row items-center gap-3 border-b border-hairline px-5 py-4">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-ink">
          {category?.label ?? data.category_slug}
        </Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={request.isRefetching || responses.isRefetching}
            onRefresh={() => {
              request.refetch();
              responses.refetch();
            }}
          />
        }
      >
        <View className="gap-3">
          <Text className="text-base text-ink">{data.description}</Text>

          <View className="gap-1">
            <Text className="text-sm text-muted">{formatWhen(data.scheduled_for)}</Text>
            <Text className="text-sm text-muted">
              {data.location_label} · searching within {formatRadius(data.search_radius_m)}
            </Text>
            {data.offered_amount !== null ? (
              <Text className="text-sm font-medium text-ink">
                You offered {formatMoney(data.offered_amount, data.currency)}
              </Text>
            ) : null}
          </View>
        </View>

        {isConnected ? (
          <Button
            label="Open your connection"
            variant="active"
            size="lg"
            onPress={() => router.push(`/engagement/${id}`)}
          />
        ) : null}

        {data.status === 'completed' ? (
          <View className="gap-3">
            <View className="gap-1 rounded-2xl bg-surface p-4">
              <Text className="text-base font-semibold text-ink">This request is finished</Text>
              <Text className="text-sm text-muted">
                {data.completed_at ? `Completed ${formatAgo(data.completed_at)}.` : ''}
              </Text>
            </View>
            {data.is_rated ? (
              <Button
                label="See the connection"
                variant="secondary"
                onPress={() => router.push(`/engagement/${id}`)}
              />
            ) : (
              <Button
                label="Rate your provider"
                size="lg"
                onPress={() => router.push(`/rate/${id}`)}
              />
            )}
          </View>
        ) : null}

        {isSearching ? (
          <View className="gap-4">
            <Text className="text-lg font-semibold text-ink">
              {pending.length > 0
                ? `${pending.length} ${pending.length === 1 ? 'person' : 'people'} can help`
                : 'Looking for someone'}
            </Text>

            {responses.isError ? (
              <ErrorState error={responses.error} onRetry={() => responses.refetch()} />
            ) : null}

            {pending.length === 0 ? (
              <View className="gap-3 rounded-2xl border border-hairline p-4">
                <Text className="text-base text-muted">
                  Your request is with everyone Active nearby who offers{' '}
                  {category?.label.toLowerCase() ?? 'this'}. Nobody can see where you are — only
                  roughly how far away you are.
                </Text>
                <Text className="text-base text-muted">
                  If nobody answers, widen the area you&apos;re searching. That changes who gets
                  offered the request, and nothing else.
                </Text>
                {expandRadius.isError ? <InlineError error={expandRadius.error} /> : null}
                <Button
                  label={`Search wider than ${formatRadius(data.search_radius_m)}`}
                  variant="secondary"
                  loading={expandRadius.isPending}
                  onPress={() => expandRadius.mutate()}
                />
              </View>
            ) : null}

            {acceptResponse.isError ? <InlineError error={acceptResponse.error} /> : null}

            {pending.map((response) => (
              <View
                key={response.response_id}
                className="gap-3 rounded-2xl border border-hairline p-4"
              >
                <View className="flex-row items-center gap-3">
                  <Avatar path={response.avatar_path} name={response.display_name} />
                  <View className="flex-1 gap-1">
                    <Text className="text-lg font-semibold text-ink">{response.display_name}</Text>
                    <StarRating average={response.rating_average} count={response.rating_count} />
                    <Text className="text-sm text-muted">
                      {response.jobs_completed} {response.jobs_completed === 1 ? 'job' : 'jobs'}{' '}
                      delivered · {formatDistance(response.distance_m)}
                    </Text>
                  </View>
                </View>

                {response.bio ? <Text className="text-base text-muted">{response.bio}</Text> : null}

                {response.message ? (
                  <View className="rounded-xl bg-surface p-3">
                    <Text className="text-base text-ink">{response.message}</Text>
                  </View>
                ) : null}

                <View className="flex-row flex-wrap gap-x-4">
                  {response.quoted_amount !== null ? (
                    <Text className="text-base font-semibold text-ink">
                      {formatMoney(response.quoted_amount, data.currency)}
                    </Text>
                  ) : null}
                  {response.eta_minutes !== null ? (
                    <Text className="text-base text-muted">
                      Can be there in {response.eta_minutes} min
                    </Text>
                  ) : null}
                  <Text className="text-base text-muted">{formatAgo(response.created_at)}</Text>
                </View>

                <View className="flex-row gap-3">
                  <Button
                    label="Not this one"
                    variant="secondary"
                    className="flex-1"
                    loading={declineResponse.isPending}
                    onPress={() => declineResponse.mutate(response.response_id)}
                  />
                  <Button
                    label="Accept"
                    variant="active"
                    className="flex-1"
                    loading={acceptResponse.isPending}
                    onPress={() =>
                      Alert.alert(
                        `Accept ${response.display_name}?`,
                        'They will get your exact location and phone number, and you get theirs. Everyone else who responded will be told the request is taken.',
                        [
                          { text: 'Not yet', style: 'cancel' },
                          {
                            text: 'Accept',
                            onPress: () => acceptResponse.mutate(response.response_id),
                          },
                        ],
                      )
                    }
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {isSearching || data.status === 'accepted' ? (
          <View className="gap-3">
            {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
            <Button
              label="Cancel this request"
              variant="danger"
              loading={cancelRequest.isPending}
              onPress={confirmCancel}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
