import { Linking, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { PersonRow } from '@/components/ui/PersonRow';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useCategoryIndex } from '@/features/categories/api';
import { useStartRequest } from '@/features/requests/provider-api';
import {
  useCompleteRequest,
  useEngagement,
  useLiveRequest,
} from '@/features/requests/requester-api';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import { colors } from '@/theme';

/** Straight-line distance, used only to tell the requester roughly where their provider is. */
function metresBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLng / 2) ** 2;

  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(a)));
}

function openInMaps(latitude: number, longitude: number, label: string) {
  const url = Platform.select({
    ios: `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });

  Linking.openURL(url);
}

const STEPS = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_progress', label: 'On the way' },
  { key: 'completed', label: 'Complete' },
] as const;

function statusStepIndex(status: string): number {
  if (status === 'completed') return 2;
  if (status === 'in_progress') return 1;
  return 0;
}

/**
 * The connected screen. This is the only place exact coordinates and phone numbers are
 * shown, and it is reachable only after the requester accepted a provider — the server
 * refuses public.get_engagement for any earlier state.
 *
 * Communication in the MVP is the phone the account was created with. There is no in-app
 * messaging yet, so the two parties use the channel they already trust.
 */
export default function EngagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const engagement = useEngagement(id);
  const categories = useCategoryIndex();
  const startRequest = useStartRequest(id);
  const completeRequest = useCompleteRequest(id);

  useLiveRequest(id);

  if (engagement.isPending) {
    return (
      <Screen>
        <Header title="Connected" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (engagement.isError) {
    return (
      <Screen>
        <Header title="Connected" onBack={() => router.back()} />
        <ErrorState error={engagement.error} onRetry={() => engagement.refetch()} />
      </Screen>
    );
  }

  if (!engagement.data) {
    return (
      <Screen>
        <Header title="Connected" onBack={() => router.back()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Nothing to show here"
          message="This request has not been accepted, so there are no shared details yet."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const data = engagement.data;
  const category = categories.data?.get(data.category_slug);
  const agreedAmount = data.quoted_amount ?? data.offered_amount;
  const stepIndex = statusStepIndex(data.request_status);

  const providerDistance =
    data.provider_latitude !== null && data.provider_longitude !== null
      ? metresBetween(
          { latitude: data.provider_latitude, longitude: data.provider_longitude },
          { latitude: data.request_latitude, longitude: data.request_longitude },
        )
      : null;

  return (
    <Screen>
      <Header title={category?.label ?? data.category_slug} onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={engagement.isRefetching}
            onRefresh={() => engagement.refetch()}
          />
        }
      >
        <Card tone="active">
          <Text className="text-sm font-semibold text-active">
            {data.viewer_is_requester ? 'Helping you' : "You're helping"}
          </Text>

          <PersonRow
            avatarPath={data.counterparty_avatar_path}
            name={data.counterparty_display_name}
            ratingAverage={data.counterparty_rating_average}
            ratingCount={data.counterparty_rating_count}
          />

          {data.counterparty_phone ? (
            <View className="flex-row gap-3">
              <Button
                label="Call"
                icon="call"
                className="flex-1"
                onPress={() => Linking.openURL(`tel:${data.counterparty_phone}`)}
              />
              <Button
                label="Message"
                icon="chatbubble"
                variant="secondary"
                className="flex-1"
                onPress={() => Linking.openURL(`sms:${data.counterparty_phone}`)}
              />
            </View>
          ) : null}
        </Card>

        {/* A calm, simple stepper — the two people involved should never have to guess
            where things stand. */}
        <View className="flex-row items-center">
          {STEPS.map((step, index) => (
            <View key={step.key} className="flex-1 flex-row items-center">
              <View className="items-center gap-1.5">
                <View
                  className={
                    index <= stepIndex
                      ? 'h-3 w-3 rounded-full bg-active'
                      : 'h-3 w-3 rounded-full bg-hairline'
                  }
                />
                <Text
                  className={
                    index <= stepIndex ? 'text-xs font-semibold text-ink' : 'text-xs text-subtle'
                  }
                >
                  {step.label}
                </Text>
              </View>
              {index < STEPS.length - 1 ? (
                <View
                  className={
                    index < stepIndex ? 'h-0.5 flex-1 bg-active' : 'h-0.5 flex-1 bg-hairline'
                  }
                  style={{ marginBottom: 16 }}
                />
              ) : null}
            </View>
          ))}
        </View>

        <Card>
          <View className="flex-row items-center gap-2">
            <Ionicons name="location" size={18} color={colors.ink} />
            <Text className="text-base font-semibold text-ink">
              {data.viewer_is_requester ? 'Your location' : 'Where to go'}
            </Text>
          </View>

          <Text className="text-base text-muted">{data.location_label}</Text>
          <Text className="text-sm text-subtle">
            {data.request_latitude.toFixed(5)}, {data.request_longitude.toFixed(5)}
          </Text>

          <Button
            label="Open in Maps"
            variant="secondary"
            icon="navigate"
            onPress={() =>
              openInMaps(data.request_latitude, data.request_longitude, data.location_label)
            }
          />

          {data.viewer_is_requester && providerDistance !== null ? (
            <Text className="text-sm text-muted">
              {data.counterparty_display_name?.split(' ')[0] ?? 'Your provider'} is about{' '}
              {formatDistance(providerDistance)} from here.
            </Text>
          ) : null}
        </Card>

        <View className="gap-2">
          <Text className="text-lg font-bold text-ink">What was asked for</Text>
          <Text className="text-base text-ink">{data.description}</Text>
          <Text className="text-sm text-muted">{formatWhen(data.scheduled_for)}</Text>
          {agreedAmount !== null ? (
            <Text className="text-base font-semibold text-ink">
              {formatMoney(agreedAmount, data.currency)}
              {data.quoted_amount !== null ? ' (quoted)' : ' (offered)'}
            </Text>
          ) : (
            <Text className="text-base text-muted">
              No amount was agreed in the app. Settle it between yourselves.
            </Text>
          )}
        </View>

        {!data.viewer_is_requester && data.request_status === 'accepted' ? (
          <View className="gap-3">
            {startRequest.isError ? <InlineError error={startRequest.error} /> : null}
            <Button
              label="I've started"
              variant="active"
              size="lg"
              loading={startRequest.isPending}
              onPress={() => startRequest.mutate()}
            />
          </View>
        ) : null}

        {data.viewer_is_requester && ['accepted', 'in_progress'].includes(data.request_status) ? (
          <View className="gap-3">
            <Text className="text-base text-muted">
              Mark this done once the service has actually happened. You&apos;ll be asked to rate{' '}
              {data.counterparty_display_name?.split(' ')[0] ?? 'them'} afterwards.
            </Text>
            {completeRequest.isError ? <InlineError error={completeRequest.error} /> : null}
            <Button
              label="Mark as completed"
              size="lg"
              loading={completeRequest.isPending}
              onPress={() =>
                completeRequest.mutate(undefined, {
                  onSuccess: () => router.replace(`/rate/${id}`),
                })
              }
            />
          </View>
        ) : null}

        {data.request_status === 'completed' && data.viewer_is_requester && !data.rating_stars ? (
          <Button label="Rate your provider" size="lg" onPress={() => router.push(`/rate/${id}`)} />
        ) : null}

        {data.rating_stars ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-surface p-4">
            <Ionicons name="star" size={18} color={colors.warning} />
            <Text className="text-base text-ink">
              {data.viewer_is_requester
                ? `You rated this ${data.rating_stars} out of 5.`
                : `You were rated ${data.rating_stars} out of 5.`}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
