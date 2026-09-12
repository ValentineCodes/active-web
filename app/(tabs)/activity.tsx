import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { formatDistanceToNowStrict } from 'date-fns';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { StarRating } from '@/components/ui/Stars';
import {
  useAvailability,
  useGoOffline,
  useRefreshActivePosition,
} from '@/features/availability/api';
import { useCategoryIndex } from '@/features/categories/api';
import { useMyResponses, useNearbyRequests } from '@/features/requests/provider-api';
import { requestStatusBadge, responseStatusBadge } from '@/features/requests/status';
import { cn } from '@/lib/cn';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import { readPositionIfPermitted } from '@/lib/location';

export default function ActivityScreen() {
  const [tab, setTab] = useState<'nearby' | 'responses'>('nearby');

  const availability = useAvailability();
  const categories = useCategoryIndex();
  const goOffline = useGoOffline();
  const refreshPosition = useRefreshActivePosition();

  const isActive = availability.data?.status === 'available';
  const nearby = useNearbyRequests({ enabled: isActive });
  const responses = useMyResponses();

  // Match against where the provider is now, not where they were when they went Active.
  // Permission was granted at that moment, so this never prompts.
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;

      readPositionIfPermitted().then((position) => {
        if (position) refreshPosition.mutate(position);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]),
  );

  return (
    <Screen>
      <View className="gap-4 p-5 pb-2">
        <Text className="text-3xl font-bold text-ink">Activity</Text>

        {isActive && availability.data?.expires_at ? (
          <View className="flex-row items-center gap-3 rounded-2xl border border-active bg-active-soft p-4">
            <View className="flex-1 gap-1">
              <Badge label="Active" tone="active" />
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
          </View>
        ) : null}

        <View className="flex-row rounded-2xl bg-surface p-1">
          {(
            [
              { key: 'nearby', label: 'Nearby' },
              { key: 'responses', label: 'Your responses' },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setTab(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === option.key }}
              className={cn(
                'flex-1 items-center rounded-xl py-2',
                tab === option.key && 'bg-canvas',
              )}
            >
              <Text
                className={cn(
                  'text-base font-semibold',
                  tab === option.key ? 'text-ink' : 'text-muted',
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'nearby' ? (
        !isActive ? (
          <EmptyState
            icon="flash-outline"
            title="You're offline"
            message="Go Active to choose what you can help with, set how far you'll travel, and start seeing requests near you."
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
              <View className="gap-3 rounded-2xl border border-hairline p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-lg font-semibold text-ink">
                    {categories.data?.get(item.category_slug)?.label ?? item.category_slug}
                  </Text>
                  {item.offered_amount !== null ? (
                    <Text className="text-base font-semibold text-ink">
                      {formatMoney(item.offered_amount, item.currency)}
                    </Text>
                  ) : (
                    <Badge label="Open to offers" tone="neutral" />
                  )}
                </View>

                <Text className="text-base text-muted">{item.description}</Text>

                <View className="flex-row flex-wrap gap-x-4">
                  <Text className="text-sm text-muted">{formatDistance(item.distance_m)}</Text>
                  <Text className="text-sm text-muted">{item.location_label}</Text>
                  <Text className="text-sm text-muted">{formatWhen(item.scheduled_for)}</Text>
                </View>

                <View className="flex-row items-center gap-3 border-t border-hairline pt-3">
                  <Avatar
                    path={item.requester_avatar_path}
                    name={item.requester_display_name}
                    size="sm"
                  />
                  <View className="flex-1">
                    <Text className="text-base font-medium text-ink">
                      {item.requester_display_name}
                    </Text>
                    <StarRating
                      average={item.requester_rating_average}
                      count={item.requester_rating_count}
                    />
                  </View>
                  <Button
                    label="Respond"
                    onPress={() => router.push(`/respond/${item.request_id}`)}
                  />
                </View>

                {item.response_count > 0 ? (
                  <Text className="text-sm text-muted">
                    {item.response_count} {item.response_count === 1 ? 'person has' : 'people have'}{' '}
                    already responded
                  </Text>
                ) : null}
              </View>
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
            const badge = isConnected
              ? requestStatusBadge(item.request_status, 0)
              : responseStatusBadge(item.response_status);

            return (
              <Pressable
                disabled={!isConnected}
                onPress={() => router.push(`/engagement/${item.request_id}`)}
                accessibilityRole={isConnected ? 'button' : undefined}
                className={cn(
                  'gap-2 rounded-2xl border border-hairline p-4',
                  isConnected && 'border-active bg-active-soft active:opacity-80',
                )}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-lg font-semibold text-ink">
                    {categories.data?.get(item.category_slug)?.label ?? item.category_slug}
                  </Text>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>

                <Text className="text-base text-muted" numberOfLines={2}>
                  {item.description}
                </Text>

                <View className="flex-row flex-wrap gap-x-4">
                  <Text className="text-sm text-muted">{item.requester_display_name}</Text>
                  <Text className="text-sm text-muted">{formatDistance(item.distance_m)}</Text>
                  {item.quoted_amount !== null ? (
                    <Text className="text-sm font-medium text-ink">
                      You quoted {formatMoney(item.quoted_amount, item.currency)}
                    </Text>
                  ) : null}
                </View>

                {isConnected ? (
                  <Text className="text-sm font-medium text-active">
                    Tap to see the exact location and contact details
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
