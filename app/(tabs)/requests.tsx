import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Link, router } from 'expo-router';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useCategoryIndex } from '@/features/categories/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestStatusBadge } from '@/features/requests/status';
import { cn } from '@/lib/cn';
import { formatMoney, formatWhen } from '@/lib/format';

const OPEN_STATUSES = ['draft', 'searching', 'accepted', 'in_progress'];

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
        <Text className="text-3xl font-bold text-ink">Your requests</Text>

        <View className="flex-row rounded-2xl bg-surface p-1">
          {(['open', 'past'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setTab(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === option }}
              className={cn('flex-1 items-center rounded-xl py-2', tab === option && 'bg-canvas')}
            >
              <Text
                className={cn(
                  'text-base font-semibold capitalize',
                  tab === option ? 'text-ink' : 'text-muted',
                )}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
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
              <Link href={`/request/${item.request_id}`} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${category?.label ?? item.category_slug} request, ${badge.label}`}
                  className="gap-2 rounded-2xl border border-hairline p-4 active:opacity-80"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="flex-1 text-lg font-semibold text-ink">
                      {category?.label ?? item.category_slug}
                    </Text>
                    <Badge label={badge.label} tone={badge.tone} />
                  </View>

                  <Text className="text-base text-muted" numberOfLines={2}>
                    {item.description}
                  </Text>

                  <View className="flex-row flex-wrap gap-x-4">
                    <Text className="text-sm text-muted">{formatWhen(item.scheduled_for)}</Text>
                    <Text className="text-sm text-muted">{item.location_label}</Text>
                    {item.offered_amount !== null ? (
                      <Text className="text-sm font-medium text-ink">
                        {formatMoney(item.offered_amount, item.currency)}
                      </Text>
                    ) : null}
                  </View>

                  {item.status === 'completed' && !item.is_rated ? (
                    <Button
                      label="Rate your provider"
                      variant="secondary"
                      onPress={() => router.push(`/rate/${item.request_id}`)}
                      className="mt-1"
                    />
                  ) : null}
                </Pressable>
              </Link>
            );
          }}
        />
      ) : null}
    </Screen>
  );
}
