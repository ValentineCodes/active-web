import { useCallback, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import {
  HomeFeedRequestPage,
  HomeFeedRequestPageSkeleton,
  proximityLabelForRequest,
} from '@/components/home/HomeFeedRequestPage';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import type { PublicRequest } from '@/features/requests/browse-api';
import { useHomeBrowseFeed } from '@/features/requests/use-home-browse-feed';
import { useHomeFeedContentInset } from '@/components/ui/tab-bar-insets';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';

type HomeFeedProps = {
  searchQuery: string;
  onOpenSearch: () => void;
};

export function HomeFeed({ searchQuery, onOpenSearch }: HomeFeedProps) {
  const feed = useHomeBrowseFeed(searchQuery);
  const tabBarInset = useHomeFeedContentInset();
  const [pageHeight, setPageHeight] = useState(0);

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
      router.push({
        pathname: '/respond/[id]',
        params: {
          id: request.request_id,
          ...(position
            ? { lat: String(position.latitude), lng: String(position.longitude) }
            : {}),
        },
      });
    },
    [feed.ownOpenRequestIds, feed.position],
  );

  const renderItem = useCallback(
    ({ item }: { item: PublicRequest }) => {
      if (pageHeight < 1) return null;

      const isOwnRequest = feed.ownOpenRequestIds.has(item.request_id);
      const waiting = feed.myResponses?.some(
        (response) =>
          response.request_id === item.request_id &&
          response.response_status === 'pending' &&
          (response.request_status === 'posted' || response.request_status === 'searching'),
      );

      return (
        <HomeFeedRequestPage
          request={item}
          pageHeight={pageHeight}
          tabBarInset={tabBarInset}
          proximityLabel={proximityLabelForRequest(item, isOwnRequest)}
          isOwnRequest={isOwnRequest}
          waiting={Boolean(waiting)}
          onOpen={() => openRequest(item, feed.position)}
        />
      );
    },
    [
      feed.myResponses,
      feed.ownOpenRequestIds,
      feed.position,
      openRequest,
      pageHeight,
      tabBarInset,
    ],
  );

  const onEndReached = useCallback(() => {
    feed.fetchNextPage();
  }, [feed]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<PublicRequest> | null | undefined, index: number) => ({
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
  const showFeedSearch = !feed.searchNeedsLocation;

  return (
    <View className="min-h-0 flex-1 bg-canvas" onLayout={onFeedLayout}>
      {feed.isError ? (
        <View className="px-5 pt-4">
          <InlineError error={feed.error} />
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
          style={{ flex: 1 }}
          className="bg-canvas"
          data={feed.rows}
          keyExtractor={(item) => item.request_id}
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
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          scrollIndicatorInsets={{ bottom: tabBarInset }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      ) : null}

      {showFeedSearch ? (
        <Pressable
          onPress={onOpenSearch}
          accessibilityRole="button"
          accessibilityLabel="Search requests"
          hitSlop={8}
          className="absolute right-4 top-4 z-10 h-10 w-10 items-center justify-center rounded-full bg-black/45 active:opacity-90"
        >
          <Ionicons name="search-outline" size={20} color="#ffffff" />
        </Pressable>
      ) : null}
    </View>
  );
}
