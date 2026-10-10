import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { HomeActiveRequestBanner } from '@/components/HomeActiveRequestBanner';
import { NearbyRequests } from '@/components/NearbyRequests';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import {
  FAB_EDGE_INSET,
  useFabBottomOffset,
  useTabBarScrollPadding,
} from '@/components/ui/tab-bar-insets';
import { Screen } from '@/components/ui/Screen';
import { ErrorState } from '@/components/ui/StateView';
import { hasProviderCommitments, useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { pickHomeActiveRequest } from '@/features/requests/home-active-request';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { formatGreeting } from '@/lib/format';
import { queryKeys } from '@/lib/query/keys';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useTheme } from '@/theme';

const CREATE_FAB_SIZE = 56;

export default function HomeScreen() {
  const { colors } = useTheme();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const activeSearchQuery = q?.trim() ?? '';

  const profile = useProfile();
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const queryClient = useQueryClient();

  const activeRequest = pickHomeActiveRequest(requests.data, responses.data);
  const profileSkeleton = showQuerySkeleton(profile);

  const fabBottom = useFabBottomOffset();
  const tabBarScrollPadding = useTabBarScrollPadding();
  const listBottomPadding = fabBottom + CREATE_FAB_SIZE + 12;

  const openSearch = useCallback(() => {
    router.push({
      pathname: '/search',
      params: activeSearchQuery ? { q: activeSearchQuery } : undefined,
    });
  }, [activeSearchQuery]);

  const onPullRefresh = useCallback(async () => {
    await Promise.all([
      requests.refetch(),
      responses.refetch(),
      attendance.refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll }),
    ]);
  }, [attendance, queryClient, requests, responses]);

  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  const clearSearch = () => {
    router.setParams({ q: '' });
  };

  if (profile.isError) {
    return (
      <Screen>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-3"
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
        scrollIndicatorInsets={{ bottom: tabBarScrollPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="flex-row items-start justify-between gap-3 pb-1">
          {profileSkeleton ? (
            <>
              <View className="min-w-0 flex-1 gap-2">
                <SkeletonBlock className="h-8 w-56 max-w-full rounded-lg" />
                <SkeletonBlock className="h-5 w-44 max-w-full rounded-lg" />
              </View>
              <View className="flex-row items-center gap-2.5 pt-0.5">
                <SkeletonBlock className="h-10 w-10 rounded-full" />
              </View>
            </>
          ) : (
            <>
              <View className="min-w-0 flex-1 gap-1.5">
                <Text
                  className="text-2xl font-bold leading-8 text-ink"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {formatGreeting(profile.data?.display_name ?? null)}
                </Text>
                <Text className="text-base leading-6 text-muted">Get help or Get money</Text>
              </View>
              <View className="flex-row items-center gap-2.5 pt-0.5">
                <Pressable
                  onPress={openSearch}
                  accessibilityRole="button"
                  accessibilityLabel="Search requests"
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
                >
                  <Ionicons name="search-outline" size={24} color={colors.ink} />
                </Pressable>
                <Pressable
                  onPress={() => router.push('/profile')}
                  accessibilityRole="button"
                  accessibilityLabel="Open your profile"
                >
                  <Avatar
                    size="sm"
                    path={profile.data?.avatar_path}
                    name={profile.data?.display_name ?? null}
                    showActiveDot={hasProviderCommitments(attendance.data)}
                  />
                </Pressable>
              </View>
            </>
          )}
        </View>

        {activeSearchQuery ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-surface px-3 py-2.5">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/search',
                  params: { q: activeSearchQuery },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Search: ${activeSearchQuery}. Tap to edit`}
              className="min-w-0 flex-1 flex-row items-center gap-2"
            >
              <Ionicons name="search-outline" size={18} color={colors.muted} />
              <Text className="min-w-0 flex-1 text-sm text-ink" numberOfLines={1}>
                {activeSearchQuery}
              </Text>
            </Pressable>
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}

        {activeRequest ? (
          <HomeActiveRequestBanner
            title={activeRequest.title}
            onPress={() => router.push(`/engagement/${activeRequest.id}`)}
          />
        ) : null}

        <NearbyRequests variant="home" searchQuery={activeSearchQuery || null} />
      </ScrollView>

      <FloatingActionButton
        variant="create"
        accessibilityLabel="Ask for help — create a request"
        onPress={() => router.push('/request/new')}
        style={{ position: 'absolute', right: FAB_EDGE_INSET, bottom: fabBottom }}
      />
    </Screen>
  );
}
