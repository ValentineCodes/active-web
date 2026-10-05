import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { ActivityMyResponseCard } from '@/components/ActivityTabCards';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import {
  myResponseActivityBadge,
  myResponseActivityMetaLine,
  myResponseActivityOfferLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';
import {
  MY_RESPONSE_ACTIVITY_FILTER_OPTIONS,
  type MyResponseActivityFilter,
  myResponseMatchesActivityFilter,
} from '@/features/requests/activity-filters';

import { useTabBarScrollPadding } from '@/components/ui/tab-bar-insets';

import { useActivityFeed } from './useActivityFeed';

export function ActivityMyResponsesTab() {
  const { myResponses, isLoading, isError, error, isRefetching, refetchAll } = useActivityFeed();
  const tabBarScrollPadding = useTabBarScrollPadding();
  const [filter, setFilter] = useState<MyResponseActivityFilter>('all');

  const filteredResponses = useMemo(
    () => myResponses.filter((response) => myResponseMatchesActivityFilter(response, filter)),
    [filter, myResponses],
  );
  const listEmpty = myResponses.length === 0 || filteredResponses.length === 0;

  if (isLoading) {
    return (
      <View className="flex-1">
        <LoadingState label="Loading activity" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1">
        <ErrorState error={error} onRetry={refetchAll} />
      </View>
    );
  }

  return (
    <View className="min-h-0 flex-1">
      <ActivityStatusFilter
        value={filter}
        options={MY_RESPONSE_ACTIVITY_FILTER_OPTIONS}
        onChange={setFilter}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-1"
        contentContainerStyle={{
          paddingBottom: tabBarScrollPadding,
          ...(listEmpty ? { flexGrow: 1, justifyContent: 'center' as const } : undefined),
        }}
        scrollIndicatorInsets={{ bottom: tabBarScrollPadding }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
      >
        {myResponses.length === 0 ? (
          <EmptyState
            layout="list"
            icon="chatbubble-outline"
            title="No responses yet"
            message="Browse nearby on Home and respond when something fits."
            action={{ label: 'Browse nearby', onPress: () => router.push('/(tabs)') }}
          />
        ) : filteredResponses.length === 0 ? (
          <EmptyState
            layout="list"
            icon="filter-outline"
            title="No matches"
            message="Nothing in this status right now. Try another filter."
          />
        ) : (
          filteredResponses.map((response) => (
            <ActivityMyResponseCard
              key={response.response_id}
              title={response.title ?? 'Request'}
              metaLine={myResponseActivityMetaLine({
                requester_display_name: response.requester_display_name,
                created_at: response.created_at,
              })}
              offerLine={myResponseActivityOfferLine(
                response.offered_amount,
                response.currency,
                response.quoted_amount,
              )}
              badge={myResponseActivityBadge({
                response_status: response.response_status,
                request_status: response.request_status,
              })}
              onPress={() =>
                router.push(
                  requestNavigationPath({
                    role: 'helper',
                    requestId: response.request_id,
                    requestStatus: response.request_status,
                    responseStatus: response.response_status,
                  }),
                )
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
