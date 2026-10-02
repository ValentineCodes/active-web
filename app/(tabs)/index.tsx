import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { HomeActiveRequestBanner } from '@/components/HomeActiveRequestBanner';
import { NearbyRequests } from '@/components/NearbyRequests';
import { Avatar } from '@/components/ui/Avatar';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { Screen } from '@/components/ui/Screen';
import { useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyWallet } from '@/features/wallet/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { formatGreeting, formatMoney } from '@/lib/format';
import { queryKeys } from '@/lib/query/keys';

const OPEN_STATUSES = ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'];

export default function HomeScreen() {
  const profile = useProfile();
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const wallet = useMyWallet();
  const queryClient = useQueryClient();

  const openRequests =
    requests.data?.filter((request) => OPEN_STATUSES.includes(request.status)) ?? [];

  const engagementAsRequester = openRequests.find((request) =>
    ['accepted', 'in_progress', 'completion_pending'].includes(request.status),
  );
  const engagementAsHelper = responses.data?.find(
    (response) =>
      response.response_status === 'accepted' &&
      ['accepted', 'in_progress', 'completion_pending'].includes(response.request_status),
  );

  const attendingRequestId = attendance.data?.attending_request_id ?? null;

  const activeRequest = (() => {
    if (engagementAsRequester) {
      return {
        id: engagementAsRequester.request_id,
        title: engagementAsRequester.title ?? 'Request',
      };
    }
    if (engagementAsHelper) {
      return {
        id: engagementAsHelper.request_id,
        title: engagementAsHelper.title ?? 'Request',
      };
    }
    if (attendingRequestId) {
      const fromRequest = requests.data?.find((row) => row.request_id === attendingRequestId);
      const fromResponse = responses.data?.find((row) => row.request_id === attendingRequestId);
      return {
        id: attendingRequestId,
        title: fromRequest?.title ?? fromResponse?.title ?? 'Active request',
      };
    }
    return null;
  })();

  const fabGapAboveTabBar = 12;
  const fabSize = 56;
  const listBottomPadding = fabGapAboveTabBar + fabSize + 24;

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-4 pt-3"
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
        refreshControl={
          <RefreshControl
            refreshing={requests.isRefetching || attendance.isRefetching}
            onRefresh={() => {
              requests.refetch();
              responses.refetch();
              attendance.refetch();
              wallet.refetch();
              queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
            }}
          />
        }
      >
        <View className="flex-row items-start justify-between gap-3 pb-1">
          <View className="flex-1 gap-1.5">
            <Text className="text-2xl font-bold leading-8 text-ink">
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
                showActiveDot={attendingRequestId != null}
              />
            </Pressable>
          </View>
        </View>

        {activeRequest ? (
          <HomeActiveRequestBanner
            title={activeRequest.title}
            onPress={() => router.push(`/engagement/${activeRequest.id}`)}
          />
        ) : null}

        <NearbyRequests variant="home" limit={20} />
      </ScrollView>

      <FloatingActionButton
        variant="create"
        accessibilityLabel="Ask for help — create a request"
        onPress={() => router.push('/request/new')}
        style={{ position: 'absolute', right: 20, bottom: fabGapAboveTabBar }}
      />
    </Screen>
  );
}
