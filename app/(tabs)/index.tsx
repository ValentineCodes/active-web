import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearbyRequests } from '@/components/NearbyRequests';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyWallet } from '@/features/wallet/api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestEngagementStatusBadge, requestStatusBadge } from '@/features/requests/status';
import { formatMoney, formatWhen } from '@/lib/format';
import { queryKeys } from '@/lib/query/keys';
import { colors } from '@/theme';

const OPEN_STATUSES = ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
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
  const fabBottom = Math.max(insets.bottom, 12) + 72;

  return (
    <Screen className="bg-surface">
      <ScrollView
        contentContainerClassName="gap-5 px-5 pb-8 pt-4"
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
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Local help
            </Text>
            <Text className="text-3xl font-bold text-ink">Near you</Text>
            <Text className="text-base leading-6 text-muted">
              Need something? Ask.{'\n'}Can help? Respond.
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.push('/wallet')}
              accessibilityRole="button"
              accessibilityLabel="Open wallet"
              className="h-11 w-11 items-center justify-center rounded-full bg-canvas"
            >
              <Ionicons name="wallet-outline" size={22} color={colors.ink} />
            </Pressable>
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
        </View>

        {wallet.data ? (
          <Pressable onPress={() => router.push('/wallet')} accessibilityRole="button">
            <Text className="text-sm text-muted">
              Wallet ·{' '}
              <Text className="font-semibold text-ink">
                {formatMoney(wallet.data.available, wallet.data.currency)} available
              </Text>
            </Text>
          </Pressable>
        ) : null}

        {attendingRequestId && !engagementAsRequester && !engagementAsHelper ? (
          <Card tone="active" className="gap-3">
            <Badge label="On a request" tone="active" />
            <Text className="text-sm text-muted">Finish it before taking another.</Text>
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

        <NearbyRequests
          compact
          limit={12}
          sectionTitle="Open nearby"
          seeAllLabel="See all on Activity"
          onSeeAll={() => router.push('/(tabs)/activity')}
        />

        {openRequests.length > 0 ? (
          <View className="gap-3">
            <SectionHeader
              title="Your requests"
              actionLabel={openRequests.length > 3 ? 'See all' : undefined}
              onAction={() => router.push('/requests')}
            />
            {openRequests.slice(0, 3).map((request) => {
              const badge = requestStatusBadge(request.status, request.pending_response_count, {
                expiresAt: request.expires_at,
              });

              return (
                <RequestCard
                  key={request.request_id}
                  title={request.title ?? 'Request'}
                  description={request.description ?? undefined}
                  badge={badge}
                  when={formatWhen(request.scheduled_for)}
                  meta={[badge.hint, request.location_label]}
                  amount={
                    request.offered_amount !== null
                      ? formatMoney(request.offered_amount, request.currency)
                      : '—'
                  }
                  onPress={() => router.push(`/request/${request.request_id}`)}
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <FloatingActionButton
        accessibilityLabel="Ask for help — create a request"
        onPress={() => router.push('/request/new')}
        style={{ position: 'absolute', right: 20, bottom: fabBottom }}
      />
    </Screen>
  );
}
