import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ErrorState } from '@/components/ui/StateView';
import { useAvailability, useGoOffline } from '@/features/availability/api';
import { useCategoryIndex } from '@/features/categories/api';
import { useProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/provider-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { requestStatusBadge } from '@/features/requests/status';
import { formatWhen } from '@/lib/format';
import { colors } from '@/theme';

export default function HomeScreen() {
  const profile = useProfile();
  const availability = useAvailability();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const categories = useCategoryIndex();
  const goOffline = useGoOffline();

  const firstName = profile.data?.display_name?.split(' ')[0];
  const openRequests =
    requests.data?.filter((request) =>
      ['searching', 'accepted', 'in_progress'].includes(request.status),
    ) ?? [];

  // A live engagement can exist on either side, and Home should surface whichever it is.
  const engagementAsRequester = openRequests.find((request) =>
    ['accepted', 'in_progress'].includes(request.status),
  );
  const engagementAsProvider = responses.data?.find(
    (response) =>
      response.response_status === 'accepted' &&
      ['accepted', 'in_progress'].includes(response.request_status),
  );

  const isActive = availability.data?.status === 'available';
  const isBusy = availability.data?.status === 'busy';

  if (availability.isError) {
    return (
      <Screen>
        <ErrorState error={availability.error} onRetry={() => availability.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={requests.isRefetching || availability.isRefetching}
            onRefresh={() => {
              requests.refetch();
              responses.refetch();
              availability.refetch();
            }}
          />
        }
      >
        <View className="gap-1">
          <Text className="text-base text-muted">
            {firstName ? `Hello, ${firstName}` : 'Hello'}
          </Text>
          <Text className="text-3xl font-bold text-ink">What do you need?</Text>
        </View>

        {engagementAsRequester || engagementAsProvider ? (
          <Link
            href={`/engagement/${engagementAsRequester?.request_id ?? engagementAsProvider?.request_id}`}
            asChild
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your connected job"
              className="gap-2 rounded-3xl border border-active bg-active-soft p-5 active:opacity-80"
            >
              <Badge label="Connected" tone="active" />
              <Text className="text-lg font-semibold text-ink">
                {engagementAsRequester ? 'Someone is on your request' : 'You have a job to deliver'}
              </Text>
              <Text className="text-base text-muted">
                Exact location and contact details are open. Tap to see them.
              </Text>
            </Pressable>
          </Link>
        ) : null}

        {isActive && availability.data?.expires_at ? (
          <View className="gap-3 rounded-3xl border border-active bg-active-soft p-5">
            <View className="flex-row items-center justify-between">
              <Badge label="You're Active" tone="active" />
              <Text className="text-sm text-muted">
                {formatDistanceToNowStrict(new Date(availability.data.expires_at))} left
              </Text>
            </View>

            <Text className="text-base text-ink">
              Offering{' '}
              {availability.data.category_slugs
                .map((slug) => categories.data?.get(slug)?.label ?? slug)
                .join(', ')}{' '}
              within {(availability.data.service_radius_m ?? 0) / 1000} km.
            </Text>

            <View className="flex-row gap-3">
              <Button
                label="See requests"
                variant="secondary"
                className="flex-1"
                onPress={() => router.push('/activity')}
              />
              <Button
                label="Go offline"
                variant="secondary"
                className="flex-1"
                loading={goOffline.isPending}
                onPress={() => goOffline.mutate()}
              />
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <Pressable
            onPress={() => router.push('/request/new')}
            accessibilityRole="button"
            accessibilityLabel="Make a request"
            className="gap-2 rounded-3xl bg-ink p-6 active:opacity-80"
          >
            <Ionicons name="add-circle" size={28} color={colors.canvas} />
            <Text className="text-2xl font-bold text-canvas">Make a request</Text>
            <Text className="text-base text-hairline">
              Say what you need. People nearby who can help will answer.
            </Text>
          </Pressable>

          {isActive || isBusy ? null : (
            <Pressable
              onPress={() => router.push('/go-active')}
              accessibilityRole="button"
              accessibilityLabel="Go Active and offer your services"
              className="gap-2 rounded-3xl bg-active p-6 active:opacity-80"
            >
              <Ionicons name="flash" size={28} color={colors.canvas} />
              <Text className="text-2xl font-bold text-canvas">Go Active</Text>
              <Text className="text-base text-active-soft">
                Choose what you can do and how far you&apos;ll travel. Start receiving requests.
              </Text>
            </Pressable>
          )}
        </View>

        {openRequests.length > 0 ? (
          <View className="gap-3">
            <Text className="text-lg font-semibold text-ink">Your open requests</Text>

            {openRequests.slice(0, 3).map((request) => {
              const badge = requestStatusBadge(request.status, request.pending_response_count);

              return (
                <Link key={request.request_id} href={`/request/${request.request_id}`} asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${categories.data?.get(request.category_slug)?.label ?? request.category_slug} request, ${badge.label}`}
                    className="gap-2 rounded-2xl border border-hairline p-4 active:opacity-80"
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="flex-1 text-base font-semibold text-ink">
                        {categories.data?.get(request.category_slug)?.label ??
                          request.category_slug}
                      </Text>
                      <Badge label={badge.label} tone={badge.tone} />
                    </View>
                    <Text className="text-sm text-muted" numberOfLines={1}>
                      {request.description}
                    </Text>
                    <Text className="text-sm text-muted">{formatWhen(request.scheduled_for)}</Text>
                  </Pressable>
                </Link>
              );
            })}

            {openRequests.length > 3 ? (
              <Button
                label={`See all ${openRequests.length} requests`}
                variant="ghost"
                onPress={() => router.push('/requests')}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
