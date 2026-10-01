import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityMyRequestCard } from '@/components/ActivityTabCards';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import {
  activityAmountLabel,
  myRequestActivityBadge,
  myRequestActivityDetailLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';

import { useActivityFeed } from './useActivityFeed';

export function ActivityMyRequestsTab() {
  const { myRequests, isLoading, isError, error, isRefetching, refetchAll } = useActivityFeed();

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
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-3 px-5 pb-28 pt-4"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
    >
      {myRequests.length === 0 ? (
        <EmptyState
          icon="add-circle-outline"
          title="No requests yet"
          message="When you need help, post a request and people nearby can respond."
          action={{ label: 'Ask for help', onPress: () => router.push('/request/new') }}
        />
      ) : (
        myRequests.map((request) => (
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
  );
}
