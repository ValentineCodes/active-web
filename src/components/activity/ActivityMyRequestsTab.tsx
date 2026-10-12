import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { ActivityMyRequestCard } from '@/components/ActivityTabCards';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import {
  activityAmountLabel,
  myRequestActivityBadge,
  myRequestActivityDetailLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';
import {
  MY_REQUEST_ACTIVITY_FILTER_OPTIONS,
  type MyRequestActivityFilter,
  myRequestMatchesActivityFilter,
} from '@/features/requests/activity-filters';

import { useTabBarScrollPadding } from '@/components/ui/tab-bar-insets';

import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';

import { useActivityFeed } from './useActivityFeed';

export function ActivityMyRequestsTab() {
  const { myRequests, isLoading, isError, isFetching, error, refetchAll } = useActivityFeed();
  useQueryErrorToast({ isError, isFetching, error });
  const onPullRefresh = useCallback(() => refetchAll(), [refetchAll]);
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);
  const tabBarScrollPadding = useTabBarScrollPadding();
  const [filter, setFilter] = useState<MyRequestActivityFilter>('all');

  const filteredRequests = useMemo(
    () => myRequests.filter((request) => myRequestMatchesActivityFilter(request, filter)),
    [filter, myRequests],
  );
  const listEmpty = myRequests.length === 0 || filteredRequests.length === 0;

  if (isLoading) {
    return (
      <View className="flex-1">
        <LoadingState label="Loading activity" />
      </View>
    );
  }

  return (
    <View className="min-h-0 flex-1">
      <ActivityStatusFilter
        value={filter}
        options={MY_REQUEST_ACTIVITY_FILTER_OPTIONS}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {myRequests.length === 0 ? (
          <EmptyState
            layout="list"
            icon="add-circle-outline"
            title="No requests yet"
            message="When you need help, post a request and people nearby can respond."
            action={{ label: 'Ask for help', onPress: () => router.push('/request/new') }}
          />
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            layout="list"
            icon="filter-outline"
            title="No matches"
            message="Nothing in this status right now. Try another filter."
          />
        ) : (
          filteredRequests.map((request) => (
            <ActivityMyRequestCard
              key={request.request_id}
              title={request.title ?? 'Request'}
              responseLine={myRequestActivityDetailLine({
                status: request.status,
                expires_at: request.expires_at,
                pending_response_count: request.pending_response_count,
                created_at: request.created_at,
                updated_at: request.updated_at,
                completed_at: request.completed_at,
                cancelled_at: request.cancelled_at,
              })}
              amount={activityAmountLabel(
                request.offered_amount,
                request.currency,
                request.agreed_provider_amount,
              )}
              badge={myRequestActivityBadge({
                status: request.status,
                expires_at: request.expires_at,
                pending_response_count: request.pending_response_count,
              })}
              onPress={() =>
                router.push(
                  requestNavigationPath({
                    role: 'requester',
                    requestId: request.request_id,
                    requestStatus: request.status,
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
