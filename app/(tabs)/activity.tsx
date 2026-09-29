import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { NearbyRequests } from '@/components/NearbyRequests';
import { useAttendance } from '@/features/attendance/api';
import {
  useLiveResponseUpdates,
  useMyResponses,
  useWithdrawResponse,
} from '@/features/requests/responses-api';
import { myResponseLifecycleBadge } from '@/features/requests/status';
import { confirmWithdrawResponse } from '@/lib/confirm';
import { formatMoney, formatProximity, formatWhen } from '@/lib/format';

const TABS = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'responses', label: 'Your responses' },
] as const;

export default function ActivityScreen() {
  const [tab, setTab] = useState<'nearby' | 'responses'>('nearby');

  const attendance = useAttendance();
  const responses = useMyResponses();
  const withdrawResponse = useWithdrawResponse();

  useLiveResponseUpdates();

  const attendingRequestId = attendance.data?.attending_request_id ?? null;

  return (
    <Screen>
      <View className="gap-4 p-5 pb-2">
        <Text className="text-3xl font-bold text-ink">Activity</Text>

        {attendingRequestId ? (
          <Card tone="active" className="gap-3">
            <Badge label="Attending" tone="active" />
            <Text className="text-sm text-muted">
              You are on a request. You can still withdraw other pending responses, but you cannot
              take a second job.
            </Text>
            <Button
              label="Open request"
              variant="active"
              onPress={() => router.push(`/engagement/${attendingRequestId}`)}
            />
          </Card>
        ) : null}

        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>

      {tab === 'nearby' ? (
        <View className="px-5 pb-10">
          <NearbyRequests />
        </View>
      ) : responses.isPending ? (
        <LoadingState label="Loading your responses" />
      ) : responses.isError ? (
        <ErrorState error={responses.error} onRetry={() => responses.refetch()} />
      ) : (
        <FlatList
          data={responses.data}
          keyExtractor={(item) => item.response_id}
          contentContainerClassName="gap-3 p-5 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={responses.isRefetching}
              onRefresh={() => responses.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-outline"
              title="No responses yet"
              message="Browse nearby requests and send a response when something fits."
            />
          }
          renderItem={({ item }) => {
            const badge = myResponseLifecycleBadge(item.response_status, item.request_status);
            const canWithdraw =
              item.response_status === 'pending' &&
              (item.request_status === 'posted' || item.request_status === 'searching');

            return (
              <RequestCard
                title={item.title ?? 'Request'}
                description={item.description ?? undefined}
                badge={badge}
                when={formatWhen(item.scheduled_for)}
                proximity={formatProximity(item.distance_m)}
                meta={[item.location_label]}
                amount={
                  item.offered_amount !== null
                    ? formatMoney(item.offered_amount, item.currency)
                    : 'Open'
                }
                onPress={() => router.push(`/respond/${item.request_id}`)}
                footer={
                  canWithdraw ? (
                    <Button
                      label="Withdraw response"
                      variant="secondary"
                      onPress={() =>
                        confirmWithdrawResponse(() => withdrawResponse.mutate(item.response_id))
                      }
                    />
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
