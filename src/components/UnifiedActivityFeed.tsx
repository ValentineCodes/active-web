import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityListRow, ActivitySectionHeader } from '@/components/ActivityListRow';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAttendance } from '@/features/attendance/api';
import {
  activityAmountLabel,
  myRequestActivitySubtitle,
  myResponseActivitySubtitle,
  requestNavigationPath,
} from '@/features/requests/activity-list';
import { useLiveResponseUpdates, useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestLifecycleCopy, resolveRequestLifecycleStage } from '@/features/domain/lifecycle';

type UnifiedActivityFeedProps = {
  showHeader?: boolean;
};

export function UnifiedActivityFeed({ showHeader = true }: UnifiedActivityFeedProps) {
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();

  useLiveResponseUpdates();

  const attendingRequestId = attendance.data?.attending_request_id ?? null;

  const attendingRequestRow = requests.data?.find((row) => row.request_id === attendingRequestId);
  const attendingResponseRow = responses.data?.find((row) => row.request_id === attendingRequestId);
  const attendingTitle = attendingRequestRow?.title ?? attendingResponseRow?.title ?? 'Request';

  const myRequests = [...(requests.data ?? [])].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });

  const myResponses = [...(responses.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const isLoading = requests.isPending || responses.isPending || attendance.isPending;
  const isError = requests.isError || responses.isError;
  const isRefetching = requests.isRefetching || responses.isRefetching || attendance.isRefetching;

  const refetchAll = () => {
    void requests.refetch();
    void responses.refetch();
    void attendance.refetch();
  };

  if (isLoading) {
    return <LoadingState label="Loading activity" />;
  }

  if (isError) {
    return <ErrorState error={requests.error ?? responses.error} onRetry={refetchAll} />;
  }

  const attendingSubtitle = attendingRequestRow
    ? joinAttendingSubtitle(attendingRequestRow)
    : attendingResponseRow
      ? myResponseActivitySubtitle({
          response_status: attendingResponseRow.response_status,
          request_status: attendingResponseRow.request_status,
          offered_amount: attendingResponseRow.offered_amount,
          quoted_amount: attendingResponseRow.quoted_amount,
          currency: attendingResponseRow.currency,
          created_at: attendingResponseRow.created_at,
        })
      : "You're currently helping with this request.";

  return (
    <ScrollView
      contentContainerClassName="gap-2 p-5 pb-12"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
    >
      {showHeader ? (
        <View className="gap-1 pb-2">
          <Text className="text-3xl font-bold text-ink">Activity</Text>
          <Text className="text-base text-muted">
            Requests you posted, responses you sent, and the job you are committed to right now.
          </Text>
        </View>
      ) : null}

      {attendingRequestId ? (
        <View className="gap-2">
          <ActivitySectionHeader
            title="Attending"
            description="The one request you are committed to helping with."
          />
          <ActivityListRow
            variant="emphasis"
            title={attendingTitle}
            subtitle={attendingSubtitle}
            onPress={() => router.push(`/engagement/${attendingRequestId}`)}
          />
        </View>
      ) : null}

      <ActivitySectionHeader title="My requests" description="Requests you created." />
      {myRequests.length === 0 ? (
        <EmptyState
          icon="add-circle-outline"
          title="No requests yet"
          message="When you need help, post a request and people nearby can respond."
          action={{ label: 'Make a request', onPress: () => router.push('/request/new') }}
        />
      ) : (
        myRequests.map((request) => (
          <ActivityListRow
            key={request.request_id}
            title={request.title ?? 'Request'}
            subtitle={myRequestActivitySubtitle({
              status: request.status,
              expires_at: request.expires_at,
              pending_response_count: request.pending_response_count,
              offered_amount: request.offered_amount,
              agreed_provider_amount: request.agreed_provider_amount,
              currency: request.currency,
              created_at: request.created_at,
              completed_at: request.completed_at,
              cancelled_at: request.cancelled_at,
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

      <ActivitySectionHeader title="My responses" description="Requests you responded to." />
      {myResponses.length === 0 ? (
        <EmptyState
          icon="chatbubble-outline"
          title="No responses yet"
          message="Browse nearby on Home and respond when something fits."
          action={{ label: 'Browse nearby', onPress: () => router.push('/(tabs)') }}
        />
      ) : (
        myResponses.map((response) => (
          <ActivityListRow
            key={response.response_id}
            title={response.title ?? 'Request'}
            subtitle={myResponseActivitySubtitle({
              response_status: response.response_status,
              request_status: response.request_status,
              offered_amount: response.offered_amount,
              quoted_amount: response.quoted_amount,
              currency: response.currency,
              created_at: response.created_at,
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

      <View className="pt-4">
        <Button label="Make a request" onPress={() => router.push('/request/new')} />
      </View>
    </ScrollView>
  );
}

function joinAttendingSubtitle(request: {
  status: string;
  expires_at: string | null;
  pending_response_count: number;
  offered_amount: number | null;
  agreed_provider_amount: number | null;
  currency: string;
}): string {
  const stage = resolveRequestLifecycleStage({
    status: request.status as never,
    pendingResponseCount: request.pending_response_count,
    expiresAt: request.expires_at,
  });
  const statusTitle = requestLifecycleCopy(stage, { viewerIsRequester: false }).title;
  const amount = activityAmountLabel(
    request.offered_amount,
    request.currency,
    request.agreed_provider_amount,
  );

  const parts = ["You're currently helping with this request.", statusTitle, amount].filter(
    Boolean,
  );
  return parts.join(' · ');
}
