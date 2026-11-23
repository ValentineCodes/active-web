import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { HomeFeedProjectPage } from '@/components/home/HomeFeedProjectPage';
import {
  HomeFeedRequestPage,
  HomeFeedRequestPageSkeleton,
  proximityLabelForRequest,
} from '@/components/home/HomeFeedRequestPage';
import type { HomeBrowseFeedRow } from '@/features/requests/use-home-browse-feed';
import { ListFooterLoading } from '@/components/ui/ListStates';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import {
  seedBrowseRequestFromFeed,
  type PublicRequest,
} from '@/features/requests/browse-api';
import { useHomeBrowseFeed } from '@/features/requests/use-home-browse-feed';
import { useHomeFeedContentInset } from '@/components/ui/tab-bar-insets';
import { useFlatListScrollRestoration } from '@/lib/navigation/use-flat-list-scroll-restoration';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';

type HomeFeedProps = {
  searchQuery: string;
};

export function HomeFeed({ searchQuery }: HomeFeedProps) {
  const queryClient = useQueryClient();
  const feed = useHomeBrowseFeed(searchQuery);
  const tabBarInset = useHomeFeedContentInset();
  const [pageHeight, setPageHeight] = useState(0);
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const listRef = useRef<FlatList<HomeBrowseFeedRow>>(null);
  const [profileRequest, setProfileRequest] = useState<PublicRequest | null>(null);

  const onFeedLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next > 0) setPageHeight(next);
  }, []);

  const { refreshing, onRefresh } = usePullToRefresh(feed.refetch);

  const openRequest = useCallback(
    (request: PublicRequest, position: typeof feed.position) => {
      const isOwnRequest = feed.ownOpenRequestIds.has(request.request_id);
      if (isOwnRequest) {
        router.push(`/request/${request.request_id}`);
        return;
      }
      seedBrowseRequestFromFeed(queryClient, request, position);
      router.push({
        pathname: '/respond/[id]',
        params: {
          id: request.request_id,
          ...(position ? { lat: String(position.latitude), lng: String(position.longitude) } : {}),
        },
      });
    },
    [feed.ownOpenRequestIds, feed.position, queryClient],
  );

  const openRequesterProfile = useCallback((request: PublicRequest) => {
    setProfileRequest(request);
    queueMicrotask(() => profileSheetRef.current?.present());
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: HomeBrowseFeedRow }) => {
      if (pageHeight < 1) return null;

      if (item.kind === 'project') {
        return (
          <HomeFeedProjectPage
            project={item.project}
            pageHeight={pageHeight}
            tabBarInset={tabBarInset}
          />
        );
      }

      const request = item.request;
      const isOwnRequest = feed.ownOpenRequestIds.has(request.request_id);
      const waiting = feed.myResponses?.some(
        (response) =>
          response.request_id === request.request_id &&
          response.response_status === 'pending' &&
          (response.request_status === 'posted' || response.request_status === 'searching'),
      );

      return (
        <HomeFeedRequestPage
          request={request}
          pageHeight={pageHeight}
          tabBarInset={tabBarInset}
          proximityLabel={proximityLabelForRequest(request, isOwnRequest)}
          isOwnRequest={isOwnRequest}
          waiting={Boolean(waiting)}
          onOpen={() => openRequest(request, feed.position)}
          onRequesterPress={() => openRequesterProfile(request)}
        />
      );
    },
    [
      feed.myResponses,
      feed.ownOpenRequestIds,
      feed.position,
      openRequest,
      openRequesterProfile,
      pageHeight,
      tabBarInset,
    ],
  );

  const onEndReached = useCallback(() => {
    feed.fetchNextPage();
  }, [feed]);

  const feedRowKey = useCallback((item: HomeBrowseFeedRow) => {
    return item.kind === 'request' ? item.request.request_id : item.project.project_id;
  }, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<HomeBrowseFeedRow> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageHeight < 1 || !feed.hasNextPage || feed.isFetchingNextPage) return;
      const index = Math.round(event.nativeEvent.contentOffset.y / pageHeight);
      if (index >= feed.rows.length - 2) {
        feed.fetchNextPage();
      }
    },
    [feed, pageHeight],
  );

  const listReady = pageHeight > 0;
  const scrollReady = listReady && feed.rows.length > 0;
  const onPersistScroll = useFlatListScrollRestoration(
    'screen:home-feed',
    listRef,
    scrollReady,
  );

  const onListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onPersistScroll(event);
    },
    [onPersistScroll],
  );

  return (
    <View className="min-h-0 flex-1 bg-canvas" onLayout={onFeedLayout}>
      {feed.isError ? (
        <View className="px-5 pt-4">
          <InlineError error={feed.error} onRetry={() => void feed.refetch()} />
        </View>
      ) : null}

      {feed.searchNeedsLocation ? (
        <View className="flex-1 justify-center px-5 pb-8">
          <EmptyState
            layout="list"
            icon="location-outline"
            title="Location needed to search"
            message="Allow location to search open requests near you."
          />
          <Pressable
            onPress={() => void feed.sortByNearest()}
            accessibilityRole="button"
            accessibilityLabel="Enable location"
            className="mt-4 self-center py-2"
          >
            <Text className="text-sm font-semibold text-brand">Enable location</Text>
          </Pressable>
        </View>
      ) : feed.loading && feed.rows.length === 0 ? (
        listReady ? (
          <HomeFeedRequestPageSkeleton pageHeight={pageHeight} tabBarInset={tabBarInset} />
        ) : null
      ) : !feed.loading && feed.rows.length === 0 ? (
        <View className="flex-1 justify-center px-5 pb-8">
          {feed.showSortNearest ? (
            <Pressable
              onPress={() => void feed.sortByNearest()}
              accessibilityRole="button"
              accessibilityLabel="Sort by nearest"
              className="mb-4 self-start py-1"
            >
              <Text className="text-sm font-semibold text-brand">Sort by nearest</Text>
            </Pressable>
          ) : null}
          <EmptyState
            layout="list"
            icon="compass-outline"
            title="Nothing open right now"
            message="New requests show up here when people need help. Check back soon."
          />
        </View>
      ) : listReady ? (
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          className="bg-canvas"
          data={feed.rows}
          keyExtractor={feedRowKey}
          renderItem={renderItem}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          snapToInterval={pageHeight}
          snapToAlignment="start"
          disableIntervalMomentum
          getItemLayout={getItemLayout}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          scrollIndicatorInsets={{ bottom: tabBarInset }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ListFooterLoading />
            ) : feed.rows.length > 0 && !feed.hasNextPage ? (
              <View className="py-6" />
            ) : undefined
          }
        />
      ) : null}

      {profileRequest ? (
        <PersonProfileBottomSheet
          key={profileRequest.requester_id}
          sheetRef={profileSheetRef}
          userId={profileRequest.requester_id}
          displayName={profileRequest.requester_display_name}
          avatarPath={profileRequest.requester_avatar_path}
          bio={profileRequest.requester_bio}
          ratingAverage={profileRequest.requester_rating_average}
          ratingCount={profileRequest.requester_rating_count}
          completionPercent={profileRequest.requester_completion_percent}
          identityVerified={profileRequest.requester_identity_verified ?? false}
        />
      ) : null}
    </View>
  );
}
