import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type Href, router, useLocalSearchParams } from 'expo-router';

import { SearchPersonRowCard } from '@/components/search/SearchPersonRowCard';
import { SearchProjectRowCard } from '@/components/search/SearchProjectRowCard';
import { SearchRequestRowCard } from '@/components/search/SearchRequestRowCard';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { SearchResultListSkeleton } from '@/components/ui/content-skeletons';
import { ListFooterLoading } from '@/components/ui/ListStates';
import { useUserId } from '@/features/auth/session';
import {
  SearchDiscoverCategory,
  useSearchDiscover,
  useSearchDiscoverInfinite,
} from '@/features/search/discovery-api';
import { buildTopDiscoverRows, flattenDiscoverPages } from '@/features/search/discovery-rows';
import type { SearchDiscoverListRow } from '@/features/search/discovery-types';
import { readPositionIfPermitted, type Position } from '@/lib/location';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const CATEGORIES: { id: SearchDiscoverCategory; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'requests', label: 'Requests' },
  { id: 'people', label: 'People' },
  { id: 'projects', label: 'Projects' },
];

export default function SearchTabScreen() {
  const colors = useColors();
  const userId = useUserId();
  const params = useLocalSearchParams<{ q?: string }>();
  const [position, setPosition] = useState<Position | null>(null);
  const [draft, setDraft] = useState(params.q?.trim() ?? '');
  const [query, setQuery] = useState(params.q?.trim() ?? '');
  const [category, setCategory] = useState<SearchDiscoverCategory>('top');

  useEffect(() => {
    const handle = setTimeout(() => setQuery(draft.trim()), 300);
    return () => clearTimeout(handle);
  }, [draft]);

  useEffect(() => {
    void readPositionIfPermitted().then(setPosition);
  }, []);

  const commitQuery = useCallback(() => {
    setQuery(draft.trim());
  }, [draft]);

  const clearSearch = useCallback(() => {
    setDraft('');
    setQuery('');
  }, []);

  const enabled = query.length > 0;
  const discoverTop = useSearchDiscover(
    category,
    query,
    position?.latitude ?? null,
    position?.longitude ?? null,
    enabled,
  );
  const discoverPaged = useSearchDiscoverInfinite(
    category,
    query,
    position?.latitude ?? null,
    position?.longitude ?? null,
    enabled,
  );

  const rows = useMemo((): SearchDiscoverListRow[] => {
    if (category === 'top') {
      if (!discoverTop.data) return [];
      return buildTopDiscoverRows(discoverTop.data);
    }
    const pages = discoverPaged.data?.pages ?? [];
    return flattenDiscoverPages(category, pages);
  }, [category, discoverPaged.data, discoverTop.data]);

  const isLoading = category === 'top' ? discoverTop.isPending : discoverPaged.isPending;
  const isError = category === 'top' ? discoverTop.isError : discoverPaged.isError;
  const error = category === 'top' ? discoverTop.error : discoverPaged.error;
  const hasMore =
    category !== 'top' &&
    (discoverPaged.hasNextPage ?? false) &&
    !discoverPaged.isFetchingNextPage;
  const topRankingDeferred = category === 'top' && discoverTop.data?.ranking === 'deferred_ud_11';

  const openRequest = useCallback(
    (requestId: string, requesterId: string) => {
      if (userId && requesterId === userId) {
        router.push(`/request/${requestId}`);
        return;
      }
      router.push({
        pathname: '/respond/[id]',
        params: {
          id: requestId,
          ...(position
            ? { lat: String(position.latitude), lng: String(position.longitude) }
            : {}),
        },
      });
    },
    [position, userId],
  );

  const loadMore = useCallback(() => {
    if (category === 'top') return;
    if (discoverPaged.hasNextPage && !discoverPaged.isFetchingNextPage) {
      void discoverPaged.fetchNextPage();
    }
  }, [category, discoverPaged]);

  const renderCategory = useCallback(
    ({ item }: { item: (typeof CATEGORIES)[number] }) => {
      const selected = item.id === category;
      return (
        <Pressable
          onPress={() => setCategory(item.id)}
          className="rounded-full px-4 py-2"
          style={{ backgroundColor: selected ? colors.active : colors.surface }}
        >
          <Text style={{ color: selected ? colors.canvas : colors.ink }}>{item.label}</Text>
        </Pressable>
      );
    },
    [category, colors.active, colors.canvas, colors.ink, colors.surface],
  );

  const listEmpty = useMemo(() => {
    if (query.length === 0) {
      return (
        <EmptyState
          layout="list"
          icon="search-outline"
          title="Search Active"
          message="Find requests, people, and projects by name or keyword."
        />
      );
    }
    if (isLoading) return <SearchResultListSkeleton />;
    if (isError) return <InlineError error={error} onRetry={() => void (category === 'top' ? discoverTop.refetch() : discoverPaged.refetch())} />;
    return (
      <EmptyState
        layout="list"
        icon="person-outline"
        title="No results"
        message={
          category === 'requests' && !position
            ? 'Allow location access to search nearby requests.'
            : 'Try another query or category.'
        }
      />
    );
  }, [category, error, isError, isLoading, position, query.length]);

  const renderRow = useCallback(
    ({ item }: { item: SearchDiscoverListRow }) => {
      if (item.kind === 'section') {
        return (
          <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            {item.title}
          </Text>
        );
      }
      if (item.kind === 'person') {
        return (
          <SearchPersonRowCard
            person={item.person}
            onPress={() => router.push(item.href as Href)}
          />
        );
      }
      if (item.kind === 'request') {
        return (
          <SearchRequestRowCard
            request={item.request}
            onPress={() => openRequest(item.request.request_id, item.request.requester_id)}
          />
        );
      }
      return (
        <SearchProjectRowCard
          project={item.project}
          onPress={() => router.push(item.href as Href)}
        />
      );
    },
    [openRequest],
  );

  return (
    <Screen className="bg-canvas" edges={['top']}>
      <View className="gap-3 px-4 pb-3 pt-2">
        <Text className="font-display text-2xl text-ink">Search</Text>
        <View
          className="flex-row items-center rounded-xl px-3"
          style={{ backgroundColor: colors.surface }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Search by name or @username"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onSubmitEditing={commitQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              poppinsInputTypography('regular', 'base'),
              { flex: 1, paddingVertical: 10, color: colors.ink },
            ]}
          />
          {draft.length > 0 ? (
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        />
        {topRankingDeferred ? (
          <Text className="text-xs text-subtle">
            Top combines fixed slices per type; blended ranking is deferred (UD-11).
          </Text>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={listEmpty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
          ListFooterComponent={
            hasMore || discoverPaged.isFetchingNextPage ? <ListFooterLoading /> : undefined
          }
        renderItem={renderRow}
      />
    </Screen>
  );
}