import { useState } from 'react';
import { FlatList, Text, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useCategoryIndex } from '@/features/categories/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestStatusBadge } from '@/features/requests/status';
import { formatMoney, formatWhen } from '@/lib/format';

const OPEN_STATUSES = ['draft', 'searching', 'accepted', 'in_progress', 'completion_pending'];

const TABS = [
  { key: 'open', label: 'Active' },
  { key: 'past', label: 'History' },
] as const;

/**
 * The requests you've made — "I Need Help" in the product's own terms. Answering
 * requests you found nearby lives on the Activity tab instead, since that side of the
 * app has its own inbox and refresh rhythm.
 */
export default function RequestsScreen() {
  const [tab, setTab] = useState<'open' | 'past'>('open');
  const requests = useMyRequests();
  const categories = useCategoryIndex();

  const visible =
    requests.data?.filter((request) =>
      tab === 'open'
        ? OPEN_STATUSES.includes(request.status)
        : !OPEN_STATUSES.includes(request.status),
    ) ?? [];

  return (
    <Screen>
      <View className="gap-4 p-5 pb-2">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-ink">Your requests</Text>
          <Text className="text-base text-muted">Things you&apos;ve asked for help with.</Text>
        </View>

        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>

      {requests.isPending ? <LoadingState /> : null}
      {requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
      ) : null}

      {requests.isSuccess ? (
        <FlatList
          data={visible}
          keyExtractor={(request) => request.request_id}
          contentContainerClassName="gap-3 p-5 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={requests.isRefetching}
              onRefresh={() => requests.refetch()}
            />
          }
          ListEmptyComponent={
            tab === 'open' ? (
              <EmptyState
                icon="add-circle-outline"
                title="No open requests"
                message="When you need something, describe it and people nearby who can help will answer."
                action={{ label: 'Make a request', onPress: () => router.push('/request/new') }}
              />
            ) : (
              <EmptyState
                icon="time-outline"
                title="Nothing here yet"
                message="Requests you finish or cancel will show up here."
              />
            )
          }
          renderItem={({ item }) => {
            const badge = requestStatusBadge(item.status, item.pending_response_count);
            const category = categories.data?.get(item.category_slug);

            return (
              <RequestCard
                icon={category?.icon}
                title={category?.label ?? item.category_slug}
                description={item.description}
                badge={badge}
                meta={[formatWhen(item.scheduled_for), item.location_label]}
                amount={
                  item.offered_amount !== null
                    ? formatMoney(item.offered_amount, item.currency)
                    : null
                }
                onPress={() => router.push(`/request/${item.request_id}`)}
                footer={
                  item.status === 'completed' && !item.is_rated ? (
                    <Button
                      label="Rate your provider"
                      variant="secondary"
                      onPress={() => router.push(`/rate/${item.request_id}`)}
                    />
                  ) : undefined
                }
              />
            );
          }}
        />
      ) : null}
    </Screen>
  );
}
