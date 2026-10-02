import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { NearbyRequests } from '@/components/NearbyRequests';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { Screen } from '@/components/ui/Screen';
import { useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyWallet } from '@/features/wallet/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestEngagementStatusBadge } from '@/features/requests/status';
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
  /** Screen content ends above the tab bar — only a small gap is needed. */
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

        {attendingRequestId && !engagementAsRequester && !engagementAsHelper ? (
          <Card tone="active" className="gap-3">
            <Badge label="Attending" tone="active" />
            <Text className="text-sm text-muted">Finish this one before you take on another.</Text>
            <Button
              label="Open request"
              variant="active"
              onPress={() => router.push(`/engagement/${attendingRequestId}`)}
            />
          </Card>
        ) : null}

        {engagementAsRequester || engagementAsHelper ? (
          <Link
            href={`/engagement/${engagementAsRequester?.request_id ?? engagementAsHelper?.request_id}`}
            asChild
          >
            <Pressable accessibilityRole="button" accessibilityLabel="Open your active request">
              <Card tone="active" className="gap-2">
                {(() => {
                  const status =
                    engagementAsRequester?.status ?? engagementAsHelper?.request_status;
                  const badge = status ? requestEngagementStatusBadge(status) : null;
                  return badge ? <Badge label={badge.label} tone={badge.tone} /> : null;
                })()}
                <Text className="text-lg font-semibold text-ink">
                  {engagementAsRequester
                    ? 'Your request is in progress'
                    : 'You are helping someone'}
                </Text>
                <Text className="text-sm text-muted">Tap for location and contact details.</Text>
              </Card>
            </Pressable>
          </Link>
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
