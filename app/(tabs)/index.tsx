import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

import { NearbyRequests } from '@/components/NearbyRequests';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/provider-api';
import { useMyWallet } from '@/features/wallet/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestEngagementStatusBadge, requestStatusBadge } from '@/features/requests/status';
import { formatMoney, formatWhen } from '@/lib/format';
import { queryKeys } from '@/lib/query/keys';
import { colors } from '@/theme';

const OPEN_STATUSES = ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'];

export default function HomeScreen() {
  const profile = useProfile();
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const wallet = useMyWallet();
  const queryClient = useQueryClient();

  const firstName = profile.data?.display_name?.split(' ')[0];
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

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
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
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <View className="gap-1">
              <Text className="text-base text-muted">
                {firstName ? `Hi, ${firstName}` : 'Welcome'}
              </Text>
              <Text className="text-3xl font-bold text-ink">One account</Text>
            </View>
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
            >
              <Avatar
                path={profile.data?.avatar_path}
                name={profile.data?.display_name ?? null}
                showActiveDot={attendingRequestId != null}
              />
            </Pressable>
          </View>
          <Text className="text-base text-muted">
            Post what you need, or respond to what others need nearby.
          </Text>
        </View>

        <Pressable
          onPress={() => router.push('/wallet')}
          accessibilityRole="button"
          accessibilityLabel="Open wallet"
        >
          <Card className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
                <Ionicons name="wallet-outline" size={22} color={colors.brand} />
              </View>
              <View className="gap-0.5">
                <Text className="text-sm font-semibold text-muted">Wallet</Text>
                <Text className="text-lg font-bold text-ink">
                  {wallet.isPending
                    ? '…'
                    : wallet.data
                      ? formatMoney(wallet.data.available, wallet.data.currency)
                      : '—'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
          </Card>
        </Pressable>

        {attendingRequestId && !engagementAsRequester && !engagementAsHelper ? (
          <Card tone="active" className="gap-3">
            <Badge label="Attending" tone="active" />
            <Text className="text-sm text-muted">
              You are on a request. Finish it before taking another.
            </Text>
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
            <Pressable accessibilityRole="button" accessibilityLabel="Open your connected job">
              <Card tone="active">
                {(() => {
                  const status =
                    engagementAsRequester?.status ?? engagementAsHelper?.request_status;
                  const badge = status ? requestEngagementStatusBadge(status) : null;
                  return badge ? <Badge label={badge.label} tone={badge.tone} /> : null;
                })()}
                <Text className="text-lg font-semibold text-ink">
                  {engagementAsRequester ? 'Someone is on your request' : 'You are helping someone'}
                </Text>
                <Text className="text-base text-muted">
                  Exact location and contact details are open. Tap to see them.
                </Text>
              </Card>
            </Pressable>
          </Link>
        ) : null}

        <Pressable
          onPress={() => router.push('/request/new')}
          accessibilityRole="button"
          accessibilityLabel="Make a request"
          className="gap-3 rounded-3xl bg-brand p-6 active:opacity-90"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="add" size={26} color={colors.canvas} />
          </View>
          <View className="gap-1">
            <Text className="text-2xl font-bold text-canvas">Make a request</Text>
            <Text className="text-base text-canvas/80">
              Ask for help. It stays open only while you need it.
            </Text>
          </View>
        </Pressable>

        <NearbyRequests />

        {openRequests.length > 0 ? (
          <View className="gap-3">
            <SectionHeader
              title="Your open requests"
              actionLabel={openRequests.length > 3 ? 'See all' : undefined}
              onAction={() => router.push('/requests')}
            />

            {openRequests.slice(0, 3).map((request) => {
              const badge = requestStatusBadge(request.status, request.pending_response_count);

              return (
                <RequestCard
                  key={request.request_id}
                  title={request.title ?? 'Request'}
                  description={request.description ?? undefined}
                  badge={badge}
                  amount={
                    request.offered_amount !== null
                      ? formatMoney(request.offered_amount, request.currency)
                      : '—'
                  }
                  meta={[formatWhen(request.scheduled_for), request.location_label]}
                  onPress={() => router.push(`/request/${request.request_id}`)}
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
