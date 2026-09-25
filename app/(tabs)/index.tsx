import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestCard } from '@/components/ui/RequestCard';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState } from '@/components/ui/StateView';
import { ServiceTag } from '@/components/ui/ServiceTag';
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
      ['searching', 'accepted', 'in_progress', 'completion_pending'].includes(request.status),
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
        <View className="flex-row items-center justify-between">
          <View className="gap-1">
            <Text className="text-base text-muted">
              {firstName ? `Hi, ${firstName}` : 'Welcome'}
            </Text>
            <Text className="text-3xl font-bold text-ink">
              {isActive ? "You're Active" : 'Need something?'}
            </Text>
            {!isActive ? (
              <Text className="text-lg text-muted">Someone nearby can help.</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
          >
            <Avatar
              path={profile.data?.avatar_path}
              name={profile.data?.display_name ?? null}
              showActiveDot={isActive}
            />
          </Pressable>
        </View>

        {engagementAsRequester || engagementAsProvider ? (
          <Link
            href={`/engagement/${engagementAsRequester?.request_id ?? engagementAsProvider?.request_id}`}
            asChild
          >
            <Pressable accessibilityRole="button" accessibilityLabel="Open your connected job">
              <Card tone="active">
                <Badge label="Connected" tone="active" />
                <Text className="text-lg font-semibold text-ink">
                  {engagementAsRequester
                    ? 'Someone is on your request'
                    : 'You have a job to deliver'}
                </Text>
                <Text className="text-base text-muted">
                  Exact location and contact details are open. Tap to see them.
                </Text>
              </Card>
            </Pressable>
          </Link>
        ) : null}

        {isActive && availability.data?.expires_at ? (
          <Card tone="active">
            <View className="flex-row items-center justify-between">
              <Badge label="Available now" tone="active" />
              <Text className="text-sm text-muted">
                {formatDistanceToNowStrict(new Date(availability.data.expires_at))} left
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {availability.data.category_slugs.map((slug) => (
                <ServiceTag
                  key={slug}
                  label={categories.data?.get(slug)?.label ?? slug}
                  icon={categories.data?.get(slug)?.icon}
                />
              ))}
            </View>

            <Text className="text-sm text-muted">
              Service radius {(availability.data.service_radius_m ?? 0) / 1000} km
            </Text>

            <View className="flex-row gap-3">
              <Button
                label="See nearby requests"
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
          </Card>
        ) : null}

        <View className="gap-3">
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
                Say what you need. People nearby who can help will answer.
              </Text>
            </View>
          </Pressable>

          {isActive || isBusy ? null : (
            <Pressable
              onPress={() => router.push('/go-active')}
              accessibilityRole="button"
              accessibilityLabel="Go Active and offer your services"
              className="gap-3 rounded-3xl bg-active-soft p-6 active:opacity-80"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-canvas">
                <Ionicons name="flash" size={24} color={colors.active} />
              </View>
              <View className="gap-1">
                <Text className="text-2xl font-bold text-ink">Go Active</Text>
                <Text className="text-base text-muted">Let people nearby know you can help.</Text>
              </View>
            </Pressable>
          )}
        </View>

        {openRequests.length > 0 ? (
          <View className="gap-3">
            <SectionHeader
              title="Your open requests"
              actionLabel={openRequests.length > 3 ? 'See all' : undefined}
              onAction={() => router.push('/requests')}
            />

            {openRequests.slice(0, 3).map((request) => {
              const badge = requestStatusBadge(request.status, request.pending_response_count);
              const category = categories.data?.get(request.category_slug);

              return (
                <RequestCard
                  key={request.request_id}
                  icon={category?.icon}
                  title={category?.label ?? request.category_slug}
                  description={request.description}
                  badge={badge}
                  meta={[formatWhen(request.scheduled_for)]}
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
