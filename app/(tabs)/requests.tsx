import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import {
  ACTIVE_REQUEST_FILTERS,
  type ActiveRequestFilter,
  groupPastRequests,
  isActiveRequest,
  matchesActiveFilter,
  matchesPastFilter,
  type PastRequestFilter,
  PAST_REQUEST_FILTERS,
  requestHistoryBucket,
  requestHistoryMeta,
} from '@/features/requests/history';
import { useMyRequests } from '@/features/requests/requester-api';
import { canReuseRequest, reuseRequestButtonLabelForRequest } from '@/features/requests/reuse';
import { requestStatusBadge } from '@/features/requests/status';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

const TABS = [
  { key: 'open', label: 'Active' },
  { key: 'past', label: 'History' },
] as const;

function FilterChips<T extends string>({
  options,
  value,
  onChange,
  countFor,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  countFor: (key: T) => number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const selected = option.key === value;
        const count = countFor(option.key);

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={cn(
              'flex-row items-center gap-1.5 rounded-full px-3.5 py-2',
              selected ? 'bg-brand' : 'bg-surface',
            )}
          >
            <Text className={cn('text-sm font-semibold', selected ? 'text-canvas' : 'text-muted')}>
              {option.label}
            </Text>
            {count > 0 && option.key !== 'all' ? (
              <View
                className={cn(
                  'min-w-5 items-center rounded-full px-1.5 py-0.5',
                  selected ? 'bg-canvas/20' : 'bg-hairline',
                )}
              >
                <Text className={cn('text-xs font-bold', selected ? 'text-canvas' : 'text-muted')}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The requests you've made — "I Need Help" in the product's own terms. Answering
 * requests you found nearby lives on the Activity tab instead, since that side of the
 * app has its own inbox and refresh rhythm.
 */
export default function RequestsScreen() {
  const [tab, setTab] = useState<'open' | 'past'>('open');
  const [activeFilter, setActiveFilter] = useState<ActiveRequestFilter>('all');
  const [pastFilter, setPastFilter] = useState<PastRequestFilter>('all');
  const requests = useMyRequests();

  const activeRequests = useMemo(
    () => requests.data?.filter(isActiveRequest) ?? [],
    [requests.data],
  );
  const pastRequests = useMemo(
    () => requests.data?.filter((request) => !isActiveRequest(request)) ?? [],
    [requests.data],
  );

  const visibleActive = useMemo(
    () =>
      activeRequests.filter((request) =>
        matchesActiveFilter(activeFilter, requestHistoryBucket(request)),
      ),
    [activeRequests, activeFilter],
  );

  const visiblePast = useMemo(
    () =>
      pastRequests.filter((request) =>
        matchesPastFilter(pastFilter, requestHistoryBucket(request)),
      ),
    [pastRequests, pastFilter],
  );

  const pastSections = useMemo(
    () => (pastFilter === 'all' ? groupPastRequests(visiblePast) : []),
    [pastFilter, visiblePast],
  );

  const renderRequest = (item: (typeof visibleActive)[number]) => {
    const badge = requestStatusBadge(item.status, item.pending_response_count);
    const reuseLabel = canReuseRequest(item.status, item.expires_at)
      ? reuseRequestButtonLabelForRequest(item.status, item.expires_at)
      : null;

    const [historyNote, scheduled, area] = requestHistoryMeta(item);

    return (
      <RequestCard
        title={item.title ?? 'Request'}
        description={item.description ?? undefined}
        badge={badge}
        when={scheduled}
        meta={[historyNote, area].filter((line): line is string => Boolean(line))}
        amount={
          item.offered_amount !== null ? formatMoney(item.offered_amount, item.currency) : null
        }
        onPress={() => router.push(`/request/${item.request_id}`)}
        footer={
          reuseLabel || (item.status === 'completed' && !item.is_rated) ? (
            <View className="gap-2">
              {item.status === 'completed' && !item.is_rated ? (
                <Button
                  label="Rate your provider"
                  variant="secondary"
                  onPress={() => router.push(`/rate/${item.request_id}`)}
                />
              ) : null}
              {reuseLabel ? (
                <Button
                  label={reuseLabel}
                  variant="secondary"
                  onPress={() => router.push(`/request/new?from=${item.request_id}`)}
                />
              ) : null}
            </View>
          ) : undefined
        }
      />
    );
  };

  return (
    <Screen>
      <View className="gap-4 p-5 pb-2">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-ink">Your requests</Text>
          <Text className="text-base text-muted">
            Active help you are waiting on, and a personal record of what you have finished.
          </Text>
        </View>

        <Segmented
          options={TABS}
          value={tab}
          onChange={(key) => {
            setTab(key);
            setActiveFilter('all');
            setPastFilter('all');
          }}
        />

        {tab === 'open' ? (
          <FilterChips
            options={ACTIVE_REQUEST_FILTERS}
            value={activeFilter}
            onChange={setActiveFilter}
            countFor={(key) =>
              activeRequests.filter((request) =>
                matchesActiveFilter(key, requestHistoryBucket(request)),
              ).length
            }
          />
        ) : (
          <FilterChips
            options={PAST_REQUEST_FILTERS}
            value={pastFilter}
            onChange={setPastFilter}
            countFor={(key) =>
              pastRequests.filter((request) =>
                matchesPastFilter(key, requestHistoryBucket(request)),
              ).length
            }
          />
        )}
      </View>

      {requests.isPending ? <LoadingState /> : null}
      {requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
      ) : null}

      {requests.isSuccess && tab === 'open' ? (
        <FlatList
          data={visibleActive}
          keyExtractor={(request) => request.request_id}
          contentContainerClassName="gap-3 p-5 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={requests.isRefetching}
              onRefresh={() => requests.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="add-circle-outline"
              title={activeFilter === 'all' ? 'No open requests' : 'Nothing in this filter'}
              message={
                activeFilter === 'all'
                  ? 'When you need something, describe it and people nearby who can help will answer.'
                  : 'Try another status filter, or make a new request.'
              }
              action={
                activeFilter === 'all'
                  ? { label: 'Make a request', onPress: () => router.push('/request/new') }
                  : undefined
              }
            />
          }
          renderItem={({ item }) => renderRequest(item)}
        />
      ) : null}

      {requests.isSuccess && tab === 'past' ? (
        pastFilter === 'all' ? (
          <SectionList
            sections={pastSections}
            keyExtractor={(request) => request.request_id}
            contentContainerClassName="gap-3 p-5 pt-3"
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={requests.isRefetching}
                onRefresh={() => requests.refetch()}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="time-outline"
                title="Nothing here yet"
                message="Finished, cancelled, and expired requests stay here so you can look back or send them again."
              />
            }
            renderSectionHeader={({ section: { title } }) => (
              <Text className="pb-1 pt-2 text-sm font-bold uppercase tracking-wide text-subtle">
                {title}
              </Text>
            )}
            renderItem={({ item }) => renderRequest(item)}
            SectionSeparatorComponent={() => <View className="h-1" />}
          />
        ) : (
          <FlatList
            data={visiblePast}
            keyExtractor={(request) => request.request_id}
            contentContainerClassName="gap-3 p-5 pt-3"
            refreshControl={
              <RefreshControl
                refreshing={requests.isRefetching}
                onRefresh={() => requests.refetch()}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="time-outline"
                title="Nothing in this filter"
                message="Try another status, or check Active for requests still in progress."
              />
            }
            renderItem={({ item }) => renderRequest(item)}
          />
        )
      ) : null}
    </Screen>
  );
}
