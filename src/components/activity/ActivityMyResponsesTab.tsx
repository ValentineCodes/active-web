import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityMyResponseCard } from '@/components/ActivityTabCards';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import {
  myResponseActivityBadge,
  myResponseActivityMetaLine,
  myResponseActivityOfferLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';

import { useTabBarScrollPadding } from '@/components/ui/tab-bar-insets';

import { useActivityFeed } from './useActivityFeed';

export function ActivityMyResponsesTab() {
  const { myResponses, isLoading, isError, error, isRefetching, refetchAll } = useActivityFeed();
  const tabBarScrollPadding = useTabBarScrollPadding();

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
      contentContainerClassName="gap-3 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: tabBarScrollPadding }}
      scrollIndicatorInsets={{ bottom: tabBarScrollPadding }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
    >
      {myResponses.length === 0 ? (
        <EmptyState
          icon="chatbubble-outline"
          title="No responses yet"
          message="Browse nearby on Home and respond when something fits."
          action={{ label: 'Browse nearby', onPress: () => router.push('/(tabs)') }}
        />
      ) : (
        myResponses.map((response) => (
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
  );
}
