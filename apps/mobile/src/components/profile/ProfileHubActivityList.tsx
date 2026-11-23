import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { useActivityFeed } from '@/components/activity/useActivityFeed';
import { ActivityMyRequestCard, ActivityMyResponseCard } from '@/components/ActivityTabCards';
import { ActivityCardListSkeleton } from '@/components/ui/content-skeletons';
import { ListFooterLoading } from '@/components/ui/ListStates';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import {
  MY_REQUEST_ACTIVITY_FILTER_OPTIONS,
  MY_RESPONSE_ACTIVITY_FILTER_OPTIONS,
  type MyRequestActivityFilter,
  type MyResponseActivityFilter,
  myRequestMatchesActivityFilter,
  myResponseMatchesActivityFilter,
} from '@/features/requests/activity-filters';
import {
  activityAmountLabel,
  myRequestActivityBadge,
  myRequestActivityDetailLine,
  myResponseActivityBadge,
  myResponseActivityMetaLine,
  myResponseActivityOfferLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';
import { useMyCreatedProjects } from '@/features/projects/project-api';
import { formatMoney } from '@/lib/format';
import { useClientPagination } from '@/lib/hooks/use-client-pagination';
import { useFlatListScrollRestoration } from '@/lib/navigation/use-flat-list-scroll-restoration';

import type { ProfileHubTab } from '@/components/profile/ProfileStickyTabs';

const PAGE_SIZE = 20;

type Props = {
  activeTab: ProfileHubTab;
  listHeader: ReactElement;
};

export function ProfileHubActivityList({ activeTab, listHeader }: Props) {
  const insets = useSafeAreaInsets();
  const scrollPadding = insets.bottom + 24;
  const listRef = useRef<FlatList<unknown>>(null);

  const activity = useActivityFeed();
  const projects = useMyCreatedProjects();

  const [requestFilter, setRequestFilter] = useState<MyRequestActivityFilter>('all');
  const [responseFilter, setResponseFilter] = useState<MyResponseActivityFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filteredRequests = useMemo(
    () =>
      activity.myRequests.filter((request) => myRequestMatchesActivityFilter(request, requestFilter)),
    [activity.myRequests, requestFilter],
  );

  const filteredResponses = useMemo(
    () =>
      activity.myResponses.filter((response) =>
        myResponseMatchesActivityFilter(response, responseFilter),
      ),
    [activity.myResponses, responseFilter],
  );

  const projectRows = useMemo(() => projects.data ?? [], [projects.data]);

  const requestPage = useClientPagination(
    filteredRequests,
    PAGE_SIZE,
    `requests:${requestFilter}:${filteredRequests.length}`,
  );
  const responsePage = useClientPagination(
    filteredResponses,
    PAGE_SIZE,
    `responses:${responseFilter}:${filteredResponses.length}`,
  );
  const projectPage = useClientPagination(
    projectRows,
    PAGE_SIZE,
    `projects:${projectRows.length}`,
  );

  const { visibleItems, hasMore, loadMore, isLoading, isError, showRequestFilter, showResponseFilter } =
    useMemo(() => {
      if (activeTab === 'requests') {
        return {
          visibleItems: requestPage.visibleItems,
          hasMore: requestPage.hasMore,
          loadMore: requestPage.loadMore,
          isLoading: activity.isLoading,
          isError: activity.isError,
          showRequestFilter: true,
          showResponseFilter: false,
        };
      }
      if (activeTab === 'responses') {
        return {
          visibleItems: responsePage.visibleItems,
          hasMore: responsePage.hasMore,
          loadMore: responsePage.loadMore,
          isLoading: activity.isLoading,
          isError: activity.isError,
          showRequestFilter: false,
          showResponseFilter: true,
        };
      }
      return {
        visibleItems: projectPage.visibleItems,
        hasMore: projectPage.hasMore,
        loadMore: projectPage.loadMore,
        isLoading: projects.isPending,
        isError: projects.isError,
        showRequestFilter: false,
        showResponseFilter: false,
      };
    }, [
      activeTab,
      activity.isError,
      activity.isLoading,
      projectPage,
      projects.isError,
      projects.isPending,
      requestPage,
      responsePage,
    ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'projects') {
        await projects.refetch();
      } else {
        await activity.refetchAll();
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, activity, projects]);

  const listHeaderComponent = useMemo(
    () => (
      <View className="gap-0">
        {listHeader}
        {showRequestFilter ? (
          <ActivityStatusFilter
            value={requestFilter}
            options={MY_REQUEST_ACTIVITY_FILTER_OPTIONS}
            onChange={setRequestFilter}
          />
        ) : null}
        {showResponseFilter ? (
          <ActivityStatusFilter
            value={responseFilter}
            options={MY_RESPONSE_ACTIVITY_FILTER_OPTIONS}
            onChange={setResponseFilter}
          />
        ) : null}
      </View>
    ),
    [
      listHeader,
      requestFilter,
      responseFilter,
      showRequestFilter,
      showResponseFilter,
    ],
  );

  const emptyContent = useMemo(() => {
    if (isLoading) {
      return <ActivityCardListSkeleton count={4} />;
    }
    if (activeTab === 'projects') {
      if (isError) {
        return <InlineError error={projects.error} onRetry={() => void projects.refetch()} />;
      }
      return (
        <EmptyState
          layout="list"
          icon="people-outline"
          title="No projects on your profile yet"
          message="Collaborative projects you create will appear here."
          action={{ label: 'Create project', onPress: () => router.push('/project/new') }}
        />
      );
    }
    if (isError) {
      return (
        <InlineError
          error={
            activeTab === 'requests'
              ? 'Could not load requests.'
              : 'Could not load responses.'
          }
          onRetry={() => void activity.refetchAll()}
        />
      );
    }
    if (activeTab === 'requests') {
      if (activity.myRequests.length === 0) {
        return (
          <EmptyState
            layout="list"
            icon="add-circle-outline"
            title="No requests yet"
            message="Post a request when you need help nearby."
            action={{ label: 'Create request', onPress: () => router.push('/request/new') }}
          />
        );
      }
      return (
        <EmptyState
          layout="list"
          icon="filter-outline"
          title="No matches"
          message="Nothing in this status right now. Try another filter."
        />
      );
    }
    if (activity.myResponses.length === 0) {
      return (
        <EmptyState
          layout="list"
          icon="chatbubble-outline"
          title="No responses yet"
          message="Browse nearby on Home and respond when something fits."
          action={{ label: 'Go to Home', onPress: () => router.push('/(tabs)') }}
        />
      );
    }
    return (
      <EmptyState
        layout="list"
        icon="filter-outline"
        title="No matches"
        message="Nothing in this status right now. Try another filter."
      />
    );
  }, [
    activeTab,
    activity.myRequests.length,
    activity.myResponses.length,
    activity.refetchAll,
    isError,
    isLoading,
    projectRows.length,
    projects.error,
    projects.refetch,
    ]);

  const scrollStorageKey = `screen:profile:${activeTab}`;
  const scrollReady = !isLoading;
  const onPersistScroll = useFlatListScrollRestoration(scrollStorageKey, listRef, scrollReady);

  const keyExtractor = useCallback(
    (item: (typeof visibleItems)[number]) => {
      if (activeTab === 'requests') {
        return 'request_id' in item ? item.request_id : String(item);
      }
      if (activeTab === 'responses') {
        return 'response_id' in item ? item.response_id : String(item);
      }
      return 'project_id' in item ? item.project_id : String(item);
    },
    [activeTab],
  );

  return (
    <FlatList
      ref={listRef}
      key={activeTab}
      data={visibleItems}
      onScroll={onPersistScroll}
      scrollEventThrottle={16}
      keyExtractor={keyExtractor}
      ListHeaderComponent={listHeaderComponent}
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 0,
        paddingBottom: scrollPadding,
        flexGrow: visibleItems.length === 0 ? 1 : undefined,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      ListEmptyComponent={<View className="min-h-[200px] justify-center">{emptyContent}</View>}
      renderItem={({ item }) => {
        if (activeTab === 'requests' && 'request_id' in item) {
          const request = item;
          return (
            <ActivityMyRequestCard
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
          );
        }
        if (activeTab === 'responses' && 'response_id' in item) {
          const response = item;
          return (
            <ActivityMyResponseCard
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
          );
        }
        if (activeTab === 'projects' && 'project_id' in item) {
          const row = item;
          return (
            <Pressable
              onPress={() => router.push(`/project/${row.project_id}` as Href)}
              className="rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90"
            >
              <Text className="text-base font-semibold text-ink">{row.title}</Text>
              <Text className="mt-1 text-sm capitalize text-muted">
                {row.status.replaceAll('_', ' ')} · {row.funding_status.replaceAll('_', ' ')}
              </Text>
              <Text className="mt-1 text-sm text-muted">
                {formatMoney(row.contributed_total_kobo / 100, MARKET.currency)} of{' '}
                {formatMoney(row.budget_total_kobo / 100, MARKET.currency)}
              </Text>
            </Pressable>
          );
        }
        return null;
      }}
      onEndReached={() => loadMore()}
      onEndReachedThreshold={0.35}
      ListFooterComponent={hasMore ? <ListFooterLoading /> : null}
    />
  );
}