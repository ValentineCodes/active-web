import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { formatDistanceToNowStrict } from 'date-fns';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PersonRow } from '@/components/ui/PersonRow';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import {
  useAvailability,
  useGoOffline,
  useRefreshActivePosition,
} from '@/features/availability/api';
import { useCategoryIndex } from '@/features/categories/api';
import {
  useLiveProviderHandshake,
  useMyResponses,
  useNearbyRequests,
  useWithdrawResponse,
} from '@/features/requests/provider-api';
import { requestStatusBadge, responseStatusBadge } from '@/features/requests/status';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import { readPositionIfPermitted } from '@/lib/location';

const TABS = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'responses', label: 'Your responses' },
] as const;

/**
 * The provider side of the app — "I Can Help" in the product's own terms. Requests you
 * post live on the Requests tab instead, since asking for help and offering it are two
 * different rhythms that happen to be the same person.
 */
export default function ActivityScreen() {
  const [tab, setTab] = useState<'nearby' | 'responses'>('nearby');

  const availability = useAvailability();
  const categories = useCategoryIndex();
  const goOffline = useGoOffline();
  const refreshPosition = useRefreshActivePosition();

  const isActive = availability.data?.status === 'available';
  const isBusy = availability.data?.status === 'busy';
  const sharesLocation = isActive || isBusy;
  const nearby = useNearbyRequests({ enabled: isActive });
  const responses = useMyResponses();
  const withdrawResponse = useWithdrawResponse();

  useLiveProviderHandshake();

  const committedRequestId = availability.data?.committed_request_id ?? null;

  // Keep a live position while available or while a client has selected this provider.
  // Going offline stops the refresh. Permission was granted when they went Active.
  useFocusEffect(
    useCallback(() => {
      if (!sharesLocation) return;

      readPositionIfPermitted().then((position) => {
        if (position) refreshPosition.mutate(position);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sharesLocation]),
  );

  return (
    <Screen>
      <View className="gap-4 p-5 pb-2">
        <Text className="text-3xl font-bold text-ink">Activity</Text>

        {isBusy ? (
          <Card tone="active" className="gap-3">
            <View className="gap-1">
              <Badge label="You've been selected!" tone="active" />
              <Text className="text-sm text-muted">
                You are committed to this job until it ends. Other requests pause; sending a
                response alone never does that.
              </Text>
            </View>
            {committedRequestId ? (
              <Button
                label="Open job details"
                variant="active"
                onPress={() => router.push(`/engagement/${committedRequestId}`)}
              />
            ) : null}
          </Card>
        ) : null}

        {isActive && availability.data?.expires_at ? (
          <Card tone="active" className="flex-row items-center gap-3">
            <View className="flex-1 gap-1">
              <Badge label="Available now" tone="active" />
              <Text className="text-sm text-muted">
                {formatDistanceToNowStrict(new Date(availability.data.expires_at))} left ·{' '}
                {(availability.data.service_radius_m ?? 0) / 1000} km
              </Text>
            </View>
            <Button
              label="Go offline"
              variant="secondary"
              loading={goOffline.isPending}
              onPress={() => goOffline.mutate()}
            />
          </Card>
        ) : null}

        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>

      {tab === 'nearby' ? (
        isBusy ? (
          <EmptyState
            icon="hand-left-outline"
            title="Paused for this job"
            message="You stay out of new matches until this job ends. Requests you already answered are under Your responses."
          />
        ) : !isActive ? (
          <EmptyState
            icon="flash-outline"
            title="You're offline"
            message="Go Active to choose what you can help with, set how far you'll travel, and start seeing requests near you. You answer only the ones you want."
            action={{ label: 'Go Active', onPress: () => router.push('/go-active') }}
          />
        ) : nearby.isPending ? (
          <LoadingState label="Looking for requests near you" />
        ) : nearby.isError ? (
          <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />
        ) : (
          <FlatList
            data={nearby.data}
            keyExtractor={(request) => request.request_id}
            contentContainerClassName="gap-3 p-5 pt-3"
            refreshControl={
              <RefreshControl refreshing={nearby.isRefetching} onRefresh={() => nearby.refetch()} />
            }
            ListEmptyComponent={
              <EmptyState
                icon="search-outline"
                title="Nothing matching yet"
                message="You'll see requests here as soon as someone nearby needs what you offer. Widening your radius or adding services helps."
                action={{
                  label: 'Change what you offer',
                  onPress: () => router.push('/go-active'),
                }}
              />
            }
            renderItem={({ item }) => (
              <RequestCard
                icon={categories.data?.get(item.category_slug)?.icon}
                title={categories.data?.get(item.category_slug)?.label ?? item.category_slug}
                description={item.description}
                amount={
                  item.offered_amount !== null
                    ? formatMoney(item.offered_amount, item.currency)
                    : 'Open to offers'
                }
                meta={[
                  formatDistance(item.distance_m),
                  item.location_label,
                  formatWhen(item.scheduled_for),
                ]}
                onPress={() => router.push(`/respond/${item.request_id}`)}
                footer={
                  <View className="flex-row items-center gap-3 border-t border-hairline pt-3">
                    <View className="min-w-0 flex-1">
                      <PersonRow
                        size="sm"
                        avatarPath={item.requester_avatar_path}
                        name={item.requester_display_name}
                        ratingAverage={item.requester_rating_average}
                        ratingCount={item.requester_rating_count}
                      />
                    </View>
                    <Button
                      label="Respond"
                      onPress={() => router.push(`/respond/${item.request_id}`)}
                    />
                  </View>
                }
              />
            )}
          />
        )
      ) : responses.isPending ? (
        <LoadingState />
      ) : responses.isError ? (
        <ErrorState error={responses.error} onRetry={() => responses.refetch()} />
      ) : (
        <FlatList
          data={responses.data}
          keyExtractor={(response) => response.response_id}
          contentContainerClassName="gap-3 p-5 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={responses.isRefetching}
              onRefresh={() => responses.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="You haven't responded to anything"
              message="Requests you answer show up here, along with whether you were chosen."
            />
          }
          renderItem={({ item }) => {
            const isConnected =
              item.response_status === 'accepted' &&
              ['accepted', 'in_progress', 'completed'].includes(item.request_status);
            const canEdit =
              item.response_status === 'pending' && item.request_status === 'searching';
            const badge = isConnected
              ? requestStatusBadge(item.request_status, 0)
              : responseStatusBadge(item.response_status);

            return (
              <RequestCard
                icon={categories.data?.get(item.category_slug)?.icon}
                title={categories.data?.get(item.category_slug)?.label ?? item.category_slug}
                description={item.description}
                badge={badge}
                meta={[
                  item.requester_display_name ?? '',
                  formatDistance(item.distance_m),
                  item.quoted_amount !== null
                    ? `You quoted ${formatMoney(item.quoted_amount, item.currency)}`
                    : '',
                ].filter(Boolean)}
                disabled={!isConnected && !canEdit}
                onPress={() =>
                  isConnected
                    ? router.push(`/engagement/${item.request_id}`)
                    : router.push(`/respond/${item.request_id}`)
                }
                footer={
                  isConnected ? (
                    <Text className="text-sm font-semibold text-active">
                      Tap to see the exact location and contact details
                    </Text>
                  ) : item.response_status === 'pending' && item.request_status === 'searching' ? (
                    <Button
                      label="Withdraw response"
                      variant="secondary"
                      loading={withdrawResponse.isPending}
                      onPress={() => withdrawResponse.mutate(item.response_id)}
                    />
                  ) : item.response_status === 'declined' && item.decline_reason ? (
                    <Text className="text-sm text-muted">{item.decline_reason}</Text>
                  ) : undefined
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
