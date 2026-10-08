import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { hasProviderCommitments, useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { pickHomeActiveRequest } from '@/features/requests/home-active-request';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyWallet } from '@/features/wallet/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { formatGreeting, formatMoney } from '@/lib/format';
import { queryKeys } from '@/lib/query/keys';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useTheme } from '@/theme';

const CREATE_FAB_SIZE = 56;
const SEARCH_FAB_SIZE = 48;
const FAB_STACK_GAP = 8;

export default function HomeScreen() {
  const { colors, shadow } = useTheme();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const activeSearchQuery = q?.trim() ?? '';

  const profile = useProfile();
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const wallet = useMyWallet();
  const queryClient = useQueryClient();
  const { refetch: refetchWallet } = wallet;

  const activeRequest = pickHomeActiveRequest(requests.data, responses.data);
  const profileSkeleton = showQuerySkeleton(profile);
  const walletSkeleton = showQuerySkeleton(wallet);

  const fabBottom = useFabBottomOffset();
  const searchFabBottom = fabBottom + CREATE_FAB_SIZE + FAB_STACK_GAP;
  const tabBarScrollPadding = useTabBarScrollPadding();
  const listBottomPadding = searchFabBottom + SEARCH_FAB_SIZE + 12;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
    }, [refetchWallet]),
  );

  const clearSearch = () => {
    router.setParams({ q: '' });
  };

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-3"
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
        scrollIndicatorInsets={{ bottom: tabBarScrollPadding }}
        refreshControl={
          <RefreshControl
            refreshing={requests.isRefetching || attendance.isRefetching}
            onRefresh={() => {
              requests.refetch();
              responses.refetch();
              attendance.refetch();
              refetchWallet();
              queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
              queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll });
            }}
          />
        }
      >
        <View className="flex-row items-start justify-between gap-3 pb-1">
          {profileSkeleton ? (
            <>
              <View className="min-w-0 flex-1 gap-2">
                <SkeletonBlock className="h-8 w-56 max-w-full rounded-lg" />
                <SkeletonBlock className="h-5 w-44 max-w-full rounded-lg" />
              </View>
              <View className="flex-row items-center gap-2.5 pt-0.5">
                {walletSkeleton ? <SkeletonBlock className="h-5 w-16 rounded-md" /> : null}
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
                {wallet.data ? (
                  <Pressable
                    onPress={() => router.push('/wallet')}
                    accessibilityRole="button"
                    accessibilityLabel="Open wallet"
                    hitSlop={8}
                  >
                    <Text className="text-sm font-semibold text-ink">
                      {formatMoney(wallet.data.available, wallet.data.currency)}
                    </Text>
                  </Pressable>
                ) : walletSkeleton ? (
                  <SkeletonBlock className="h-5 w-16 rounded-md" />
                ) : wallet.isError ? (
                  <Pressable
                    onPress={() => router.push('/wallet')}
                    accessibilityRole="button"
                    accessibilityLabel="Open wallet"
                    hitSlop={8}
                  >
                    <Text className="text-sm font-semibold text-danger">Wallet</Text>
                  </Pressable>
                ) : null}
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search requests"
        onPress={() =>
          router.push({
            pathname: '/search',
            params: activeSearchQuery ? { q: activeSearchQuery } : undefined,
          })
        }
        style={[
          shadow.raised,
          {
            position: 'absolute',
            right: FAB_EDGE_INSET,
            bottom: searchFabBottom,
            width: SEARCH_FAB_SIZE,
            height: SEARCH_FAB_SIZE,
          },
        ]}
        className="items-center justify-center rounded-full bg-surface active:opacity-90"
      >
        <Ionicons name="search-outline" size={24} color={colors.ink} />
      </Pressable>

      <FloatingActionButton
        variant="create"
        accessibilityLabel="Ask for help — create a request"
        onPress={() => router.push('/request/new')}
        style={{ position: 'absolute', right: FAB_EDGE_INSET, bottom: fabBottom }}
      />
    </Screen>
  );
}
