import { useState } from 'react';
import { Alert, Linking, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ProviderProfileModal } from '@/components/ProviderProfileModal';
import { RequestCategoryDataSection } from '@/components/RequestCategoryDataSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { PersonRow } from '@/components/ui/PersonRow';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useCategoryIndex } from '@/features/categories/api';
import {
  useCancelService,
  useContestServiceProblem as useProviderContestServiceProblem,
  useReportClientNoShow,
  useStartRequest,
  useMarkServiceComplete,
} from '@/features/requests/provider-api';
import {
  useCancelRequest,
  useCompleteRequest,
  useContestServiceProblem,
  useEngagement,
  useLiveRequest,
  useReportServiceProblem,
  type ServiceProblemKind,
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
  { key: 'accepted', label: 'Connected' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completion_pending', label: 'Confirm' },
  { key: 'completed', label: 'Complete' },
] as const;

function statusStepIndex(status: string): number {
  if (status === 'completed') return 3;
  if (status === 'completion_pending') return 2;
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
  const markServiceComplete = useMarkServiceComplete(id);
  const completeRequest = useCompleteRequest(id);
  const reportProblem = useReportServiceProblem(id);
  const contestProblem = useContestServiceProblem(id);
  const reportClientNoShow = useReportClientNoShow(id);
  const providerContestProblem = useProviderContestServiceProblem(id);
  const cancelRequest = useCancelRequest(id);
  const cancelService = useCancelService(id);
  const [profileOpen, setProfileOpen] = useState(false);

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

  const providerFirstName = data.counterparty_display_name?.split(' ')[0] ?? 'Your provider';

  const reportProblemKind = (kind: ServiceProblemKind, title: string, message: string) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => reportProblem.mutate(kind),
      },
    ]);

  const confirmReportCompletionProblem = () =>
    reportProblemKind(
      'completion_issue',
      'Report a problem?',
      'This flags the job for review and pauses payment release. Only do this if the service was not delivered as agreed.',
    );

  const openRequesterProblemMenu = () =>
    Alert.alert('Report a problem', 'What went wrong?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "Provider didn't show up",
        onPress: () =>
          reportProblemKind(
            'provider_no_show',
            'Report provider no-show?',
            `${providerFirstName} will have 24 hours to respond. Your payment stays locked until this is resolved.`,
          ),
      },
      {
        text: "Can't reach provider",
        onPress: () =>
          reportProblemKind(
            'provider_unreachable',
            "Can't reach your provider?",
            `We'll notify ${providerFirstName} to get in touch. If they don't respond within 24 hours, you may receive a full refund.`,
          ),
      },
    ]);

  const confirmReportClientNoShow = () =>
    Alert.alert(
      'Report client no-show?',
      'The client will have 24 hours to respond. If they do not, you may receive payment for this job.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report no-show',
          style: 'destructive',
          onPress: () => reportClientNoShow.mutate(),
        },
      ],
    );

  const confirmContestProblem = () =>
    Alert.alert(
      'Dispute this report?',
      'Tell us you were available and want to continue the job. This pauses any automatic outcome until support reviews it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I was there',
          onPress: () => {
            const contest = data.viewer_is_requester ? contestProblem : providerContestProblem;
            contest.mutate();
          },
        },
      ],
    );

  const problemKindLabel = (kind: string | null) => {
    switch (kind) {
      case 'provider_no_show':
        return 'Provider no-show reported';
      case 'provider_unreachable':
        return 'Provider unreachable';
      case 'client_no_show':
        return 'Client no-show reported';
      case 'completion_issue':
        return 'Completion disputed';
      default:
        return 'Problem reported';
    }
  };

  const confirmCancelRequest = () =>
    Alert.alert(
      'Cancel this job?',
      'You will receive a full refund for any payment held in the app. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel job',
          style: 'destructive',
          onPress: () =>
            cancelRequest.mutate(undefined, {
              onSuccess: () => router.replace(`/request/${id}`),
            }),
        },
      ],
    );

  const confirmCancelService = () =>
    Alert.alert(
      'Cancel this job?',
      'The requester will be refunded in full and the job will close. You will be available for other requests.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel job',
          style: 'destructive',
          onPress: () =>
            cancelService.mutate(undefined, {
              onSuccess: () => router.back(),
            }),
        },
      ],
    );

  const canCancelAsRequester =
    data.request_status === 'accepted' || data.request_status === 'in_progress';
  const canCancelAsProvider = canCancelAsRequester || data.request_status === 'completion_pending';
  const canReportActiveProblem =
    data.request_status === 'accepted' || data.request_status === 'in_progress';
  const openProblem = data.request_status === 'disputed' && data.service_problem_kind;
  const canContestProblem =
    openProblem &&
    !data.service_problem_reported_by_me &&
    data.service_problem_respond_by !== null &&
    new Date(data.service_problem_respond_by) > new Date();

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
            onPress={data.viewer_is_requester ? () => setProfileOpen(true) : undefined}
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
              {providerFirstName} is about {formatDistance(providerDistance)} from here.
            </Text>
          ) : null}
        </Card>

        <View className="gap-2">
          <Text className="text-lg font-bold text-ink">What was asked for</Text>
          <Text className="text-base text-ink">{data.description}</Text>
          <RequestCategoryDataSection
            categorySlug={data.category_slug}
            categoryData={data.category_data}
          />
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

        {!data.viewer_is_requester && ['accepted', 'in_progress'].includes(data.request_status) ? (
          <View className="gap-3">
            {markServiceComplete.isError ? <InlineError error={markServiceComplete.error} /> : null}
            {reportClientNoShow.isError ? <InlineError error={reportClientNoShow.error} /> : null}
            <Button
              label="I've completed the service"
              size="lg"
              loading={markServiceComplete.isPending}
              onPress={() => markServiceComplete.mutate()}
            />
            <Button
              label="Client didn't show up"
              variant="danger"
              loading={reportClientNoShow.isPending}
              onPress={confirmReportClientNoShow}
            />
          </View>
        ) : null}

        {!data.viewer_is_requester && data.request_status === 'completion_pending' ? (
          <Card>
            <Text className="text-base text-muted">
              Waiting for the requester to confirm. They&apos;ll be asked to rate you once they do.
            </Text>
          </Card>
        ) : null}

        {data.viewer_is_requester && data.request_status === 'completion_pending' ? (
          <View className="gap-3">
            <Card tone="warning">
              <Text className="text-base font-semibold text-ink">
                {providerFirstName} says the service is complete.
              </Text>
              <Text className="text-sm text-muted">
                Confirm only if the work was done as agreed.
              </Text>
              {data.completion_confirm_by ? (
                <Text className="text-sm text-muted">
                  If you don&apos;t respond by {formatWhen(data.completion_confirm_by)}, this job
                  will complete automatically.
                </Text>
              ) : null}
            </Card>
            {completeRequest.isError ? <InlineError error={completeRequest.error} /> : null}
            {reportProblem.isError ? <InlineError error={reportProblem.error} /> : null}
            <Button
              label="Confirm completion"
              variant="active"
              size="lg"
              loading={completeRequest.isPending}
              onPress={() =>
                completeRequest.mutate(undefined, {
                  onSuccess: () => router.replace(`/rate/${id}`),
                })
              }
            />
            <Button
              label="Report a problem"
              variant="danger"
              loading={reportProblem.isPending}
              onPress={confirmReportCompletionProblem}
            />
          </View>
        ) : null}

        {data.viewer_is_requester && canReportActiveProblem ? (
          <View className="gap-3">
            {reportProblem.isError ? <InlineError error={reportProblem.error} /> : null}
            <Button
              label="Report a problem"
              variant="danger"
              loading={reportProblem.isPending}
              onPress={openRequesterProblemMenu}
            />
          </View>
        ) : null}

        {data.request_status === 'disputed' ? (
          <Card tone="danger">
            <Text className="text-base font-semibold text-ink">
              {problemKindLabel(data.service_problem_kind)}
            </Text>
            {data.service_problem_kind === 'completion_issue' ? (
              <Text className="text-sm text-muted">
                A problem was reported. Support will follow up using the details on this request.
              </Text>
            ) : data.service_problem_reported_by_me ? (
              <Text className="text-sm text-muted">
                We notified the other party. Your payment stays locked while they have time to
                respond.
                {data.service_problem_respond_by ? (
                  <>
                    {' '}
                    If they do not respond by {formatWhen(data.service_problem_respond_by)}, the app
                    will resolve this automatically.
                  </>
                ) : null}
              </Text>
            ) : (
              <Text className="text-sm text-muted">
                Respond if this is wrong.
                {data.service_problem_respond_by ? (
                  <>
                    {' '}
                    You have until {formatWhen(data.service_problem_respond_by)} before an automatic
                    outcome.
                  </>
                ) : null}
              </Text>
            )}
            {contestProblem.isError || providerContestProblem.isError ? (
              <InlineError error={contestProblem.error ?? providerContestProblem.error} />
            ) : null}
            {canContestProblem ? (
              <Button
                label="I was there / I'm available"
                variant="secondary"
                loading={contestProblem.isPending || providerContestProblem.isPending}
                onPress={confirmContestProblem}
              />
            ) : null}
          </Card>
        ) : null}

        {data.request_status === 'no_show' ? (
          <Card tone="danger">
            <Text className="text-base font-semibold text-ink">No-show recorded</Text>
            <Text className="text-sm text-muted">
              This job closed after a no-show report. Payment followed the outcome recorded on the
              server.
            </Text>
          </Card>
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

        {canCancelAsRequester && data.viewer_is_requester ? (
          <View className="gap-3">
            {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
            <Button
              label="Cancel this job"
              variant="danger"
              loading={cancelRequest.isPending}
              onPress={confirmCancelRequest}
            />
          </View>
        ) : null}

        {canCancelAsProvider && !data.viewer_is_requester ? (
          <View className="gap-3">
            {cancelService.isError ? <InlineError error={cancelService.error} /> : null}
            <Button
              label="Cancel this job"
              variant="danger"
              loading={cancelService.isPending}
              onPress={confirmCancelService}
            />
          </View>
        ) : null}
      </ScrollView>

      {data.viewer_is_requester ? (
        <ProviderProfileModal
          visible={profileOpen}
          onClose={() => setProfileOpen(false)}
          providerId={data.counterparty_id}
          displayName={data.counterparty_display_name}
          avatarPath={data.counterparty_avatar_path}
          ratingAverage={data.counterparty_rating_average}
          ratingCount={data.counterparty_rating_count}
        />
      ) : null}
    </Screen>
  );
}
