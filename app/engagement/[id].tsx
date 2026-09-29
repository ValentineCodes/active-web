import { useState } from 'react';
import { Alert, Linking, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { PersonProfileModal } from '@/components/PersonProfileModal';
import { ReportProblemModal, type ReportProblemPayload } from '@/components/ReportProblemModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { PersonRow } from '@/components/ui/PersonRow';
import { Screen } from '@/components/ui/Screen';
import { RequestMoneyLine } from '@/components/RequestMoneyLine';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { requestLifecycleCopy } from '@/features/domain/lifecycle';
import { requestMoneyDisplay, resolveAgreedAmount } from '@/features/requests/payment-display';
import { requestEngagementStatusBadge } from '@/features/requests/status';
import {
  useCancelService,
  useReportClientNoShow,
  useStartRequest,
  useMarkServiceComplete,
} from '@/features/requests/responses-api';
import {
  useCancelRequest,
  useCompleteRequest,
  useContestServiceProblem,
  useEngagement,
  useLiveRequest,
  useReportServiceProblem,
  type ServiceProblemKind,
} from '@/features/requests/requester-api';
import { formatMoney, formatWhen } from '@/lib/format';
import { colors } from '@/theme';

function openInMaps(latitude: number, longitude: number, label: string) {
  const url = Platform.select({
    ios: `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });

  Linking.openURL(url);
}

const ENGAGEMENT_STEP_STAGES = [
  'selected',
  'in_progress',
  'completion_pending',
  'completed',
] as const;

function engagementSteps(viewerIsRequester: boolean) {
  return ENGAGEMENT_STEP_STAGES.map((stage) => ({
    key: stage === 'selected' ? 'accepted' : stage,
    label: requestLifecycleCopy(stage, { viewerIsRequester }).title,
  }));
}

function statusStepIndex(status: string): number {
  if (status === 'completed') return 3;
  if (status === 'completion_pending') return 2;
  if (status === 'in_progress') return 1;
  return 0;
}

function disputeKindRequiresDescription(kind: ServiceProblemKind): boolean {
  return (
    kind === 'completion_issue' ||
    kind === 'service_not_completed' ||
    kind === 'service_differs_from_request' ||
    kind === 'other'
  );
}

type ReportModalState = {
  kind: ServiceProblemKind;
  title: string;
  subtitle: string;
};

/**
 * The connected screen. This is the only place exact coordinates and phone numbers are
 * shown, and it is reachable only after the requester chose someone to help — the server
 * refuses public.get_engagement for any earlier state.
 *
 * Communication in the MVP is the phone the account was created with. There is no in-app
 * messaging yet, so the two parties use the channel they already trust.
 */
export default function EngagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const engagement = useEngagement(id);
  const startRequest = useStartRequest(id);
  const markServiceComplete = useMarkServiceComplete(id);
  const completeRequest = useCompleteRequest(id);
  const reportProblem = useReportServiceProblem(id);
  const contestProblem = useContestServiceProblem(id);
  const reportClientNoShow = useReportClientNoShow(id);
  const cancelRequest = useCancelRequest(id);
  const cancelService = useCancelService(id);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportModal, setReportModal] = useState<ReportModalState | null>(null);

  useLiveRequest(id);

  if (engagement.isPending) {
    return (
      <Screen>
        <Header title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (engagement.isError) {
    return (
      <Screen>
        <Header title="Your request" onBack={() => router.back()} />
        <ErrorState error={engagement.error} onRetry={() => engagement.refetch()} />
      </Screen>
    );
  }

  if (!engagement.data) {
    return (
      <Screen>
        <Header title="Your request" onBack={() => router.back()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Nothing to show here"
          message="Choose someone on your request first. Then you will see contact details and the exact location here."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const data = engagement.data;
  const stepIndex = statusStepIndex(data.request_status);
  const statusBadge = requestEngagementStatusBadge(data.request_status, {
    viewerIsRequester: data.viewer_is_requester,
  });
  const steps = engagementSteps(data.viewer_is_requester);
  const moneyDisplay = requestMoneyDisplay({
    requestStatus: data.request_status,
    paymentStatus: data.payment_status,
    offeredAmount: data.offered_amount,
    agreedAmount: data.agreed_provider_amount,
    quotedAmount: data.quoted_amount,
    currency: data.currency,
    viewerIsRequester: data.viewer_is_requester,
  });
  const agreedAmount = resolveAgreedAmount({
    agreedAmount: data.agreed_provider_amount,
    quotedAmount: data.quoted_amount,
    offeredAmount: data.offered_amount,
  });

  const helperFirstName = data.counterparty_display_name?.split(' ')[0] ?? 'They';

  const submitReport = (payload: ReportProblemPayload) => {
    const onSuccess = () => setReportModal(null);
    const input = {
      kind: payload.kind,
      description: payload.description,
      evidencePaths: payload.evidencePaths,
    };

    if (payload.kind === 'client_no_show') {
      reportClientNoShow.mutate(
        { description: payload.description, evidencePaths: payload.evidencePaths },
        { onSuccess },
      );
      return;
    }

    reportProblem.mutate(input, { onSuccess });
  };

  const openReportModal = (state: ReportModalState) => setReportModal(state);

  const openRequesterProblemMenu = () =>
    Alert.alert('Report a problem', 'What went wrong?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "They didn't show up",
        onPress: () =>
          openReportModal({
            kind: 'provider_no_show',
            title: 'Report a no-show',
            subtitle: `${helperFirstName} will have 24 hours to respond. Your payment stays on hold until this is resolved.`,
          }),
      },
      {
        text: "Can't reach them",
        onPress: () =>
          openReportModal({
            kind: 'provider_unreachable',
            title: "Can't reach them?",
            subtitle: `We'll notify ${helperFirstName}. If they don't respond within 24 hours, you may receive a full refund.`,
          }),
      },
      {
        text: 'Work not done',
        onPress: () =>
          openReportModal({
            kind: 'service_not_completed',
            title: 'Work not done',
            subtitle: 'Your payment stays on hold while we review your report.',
          }),
      },
      {
        text: 'Work differed from request',
        onPress: () =>
          openReportModal({
            kind: 'service_differs_from_request',
            title: 'Work differed from the request',
            subtitle: 'Explain how the work differed from what you asked for.',
          }),
      },
      {
        text: 'Other problem',
        onPress: () =>
          openReportModal({
            kind: 'other',
            title: 'Report another problem',
            subtitle: 'Tell us what went wrong. Your payment stays on hold until this is resolved.',
          }),
      },
    ]);

  const openHelperProblemMenu = () =>
    Alert.alert('Report a problem', 'What went wrong?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'They did not show up',
        onPress: () =>
          openReportModal({
            kind: 'client_no_show',
            title: 'Report a no-show',
            subtitle: 'They will have 24 hours to respond before an automatic outcome.',
          }),
      },
      {
        text: 'Work not done',
        onPress: () =>
          openReportModal({
            kind: 'service_not_completed',
            title: 'Work not done',
            subtitle: 'Your payment stays on hold while we review your report.',
          }),
      },
      {
        text: 'Work differed from request',
        onPress: () =>
          openReportModal({
            kind: 'service_differs_from_request',
            title: 'Work differed from the request',
            subtitle: 'Explain how the work differed from what was agreed.',
          }),
      },
      {
        text: 'Other problem',
        onPress: () =>
          openReportModal({
            kind: 'other',
            title: 'Report another problem',
            subtitle: 'Tell us what went wrong. Your payment stays on hold until this is resolved.',
          }),
      },
    ]);

  const confirmReportRequesterNoShow = () =>
    openReportModal({
      kind: 'client_no_show',
      title: 'Report a no-show',
      subtitle:
        'They will have 24 hours to respond. If they do not, you may be paid for this request.',
    });

  const confirmContestProblem = () =>
    Alert.alert(
      'Dispute this report?',
      'Tell us you were available and want to continue. This pauses any automatic outcome until support reviews it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I was there',
          onPress: () => {
            contestProblem.mutate();
          },
        },
      ],
    );

  const problemKindLabel = (kind: string | null) => {
    switch (kind) {
      case 'provider_no_show':
        return 'No-show reported';
      case 'provider_unreachable':
        return "Can't reach them";
      case 'client_no_show':
        return 'Requester no-show reported';
      case 'completion_issue':
        return 'Completion disputed';
      case 'service_not_completed':
        return 'Work not done';
      case 'service_differs_from_request':
        return 'Work differed from request';
      case 'other':
        return 'Problem reported';
      default:
        return 'Problem reported';
    }
  };

  const confirmCancelRequest = () =>
    Alert.alert(
      'Cancel request?',
      'You will receive a full refund for any payment held in the app. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel request',
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
      'Cancel request?',
      'The other person will be refunded in full and this request will close. You can respond to other requests again.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel request',
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
  const canCancelAsHelper = canCancelAsRequester || data.request_status === 'completion_pending';
  const canReportActiveProblem =
    data.request_status === 'accepted' || data.request_status === 'in_progress';
  const canReportHelperProblem =
    !data.viewer_is_requester &&
    (canReportActiveProblem || data.request_status === 'completion_pending');
  const openProblem = data.request_status === 'disputed' && data.service_problem_kind;
  const canContestProblem =
    openProblem &&
    !data.service_problem_reported_by_me &&
    data.service_problem_respond_by !== null &&
    new Date(data.service_problem_respond_by) > new Date();

  return (
    <Screen>
      <Header title={data.title} onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={engagement.isRefetching}
            onRefresh={() => engagement.refetch()}
          />
        }
      >
        <Card tone="active" className="gap-2">
          <Badge label={statusBadge.label} tone={statusBadge.tone} />
          <Text className="text-sm text-muted">{statusBadge.hint}</Text>
          <Text className="text-sm text-muted">
            Call or message below — there is no in-app chat in this version.
          </Text>
          {moneyDisplay ? <RequestMoneyLine display={moneyDisplay} /> : null}

          <PersonRow
            avatarPath={data.counterparty_avatar_path}
            name={data.counterparty_display_name}
            ratingAverage={data.counterparty_rating_average}
            ratingCount={data.counterparty_rating_count}
            onPress={() => setProfileOpen(true)}
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
          {steps.map((step, index) => (
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
              {index < steps.length - 1 ? (
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
        </Card>

        <View className="gap-2">
          <Text className="text-lg font-bold text-ink">What was asked for</Text>
          {data.description ? <Text className="text-base text-ink">{data.description}</Text> : null}
          <Text className="text-sm text-muted">{formatWhen(data.scheduled_for)}</Text>
          {agreedAmount !== null ? (
            <Text className="text-base font-semibold text-ink">
              {formatMoney(agreedAmount, data.currency)} agreed in the app
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
              label="I've completed this"
              size="lg"
              loading={markServiceComplete.isPending}
              onPress={() =>
                Alert.alert(
                  'Mark this complete?',
                  'The person who asked will confirm before you are paid.',
                  [
                    { text: 'Not yet', style: 'cancel' },
                    { text: 'Mark complete', onPress: () => markServiceComplete.mutate() },
                  ],
                )
              }
            />
            <Button
              label="They did not show up"
              variant="danger"
              loading={reportClientNoShow.isPending}
              onPress={confirmReportRequesterNoShow}
            />
          </View>
        ) : null}

        {!data.viewer_is_requester && data.request_status === 'completion_pending' ? (
          <Card>
            <Text className="text-base text-muted">
              Waiting for them to confirm. They can rate you once they do.
            </Text>
          </Card>
        ) : null}

        {data.viewer_is_requester && data.request_status === 'completion_pending' ? (
          <View className="gap-3">
            <Card tone="warning">
              <Text className="text-base font-semibold text-ink">
                {helperFirstName} says the request is complete.
              </Text>
              <Text className="text-sm text-muted">
                Confirm only if the work was done as agreed.
              </Text>
              {data.completion_confirm_by ? (
                <Text className="text-sm text-muted">
                  If you don&apos;t respond by {formatWhen(data.completion_confirm_by)}, this
                  request will complete automatically.
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
                Alert.alert(
                  'Confirm and pay them?',
                  'Only confirm if the work was done as agreed.',
                  [
                    { text: 'Not yet', style: 'cancel' },
                    {
                      text: 'Confirm',
                      onPress: () =>
                        completeRequest.mutate(undefined, {
                          onSuccess: () => router.replace(`/rate/${id}`),
                        }),
                    },
                  ],
                )
              }
            />
            <Button
              label="Report a problem"
              variant="danger"
              loading={reportProblem.isPending}
              onPress={() =>
                openReportModal({
                  kind: 'completion_issue',
                  title: 'Report a problem',
                  subtitle:
                    'This pauses payment until we review. Only do this if the work was not done as agreed.',
                })
              }
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

        {canReportHelperProblem ? (
          <View className="gap-3">
            {reportClientNoShow.isError ? <InlineError error={reportClientNoShow.error} /> : null}
            {reportProblem.isError ? <InlineError error={reportProblem.error} /> : null}
            <Button
              label="Report a problem"
              variant="danger"
              loading={reportClientNoShow.isPending || reportProblem.isPending}
              onPress={openHelperProblemMenu}
            />
          </View>
        ) : null}

        {data.request_status === 'disputed' ? (
          <Card tone="danger">
            <Text className="text-base font-semibold text-ink">
              {problemKindLabel(data.service_problem_kind)}
            </Text>
            {data.service_problem_kind === 'completion_issue' ||
            data.service_problem_kind === 'service_not_completed' ||
            data.service_problem_kind === 'service_differs_from_request' ||
            data.service_problem_kind === 'other' ? (
              <Text className="text-sm text-muted">
                Support will review this. Your payment stays on hold until this is resolved.
                {data.service_problem_description ? (
                  <> You reported: “{data.service_problem_description}”</>
                ) : null}
              </Text>
            ) : data.service_problem_reported_by_me ? (
              <Text className="text-sm text-muted">
                We notified the other person. Your payment stays on hold while they have time to
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
            {contestProblem.isError ? <InlineError error={contestProblem.error} /> : null}
            {canContestProblem ? (
              <Button
                label="I was there / I'm available"
                variant="secondary"
                loading={contestProblem.isPending}
                onPress={confirmContestProblem}
              />
            ) : null}
          </Card>
        ) : null}

        {data.request_status === 'no_show' ? (
          <Card tone="danger">
            <Text className="text-base font-semibold text-ink">No-show recorded</Text>
            <Text className="text-sm text-muted">
              This request closed after a no-show report. Payment followed the outcome recorded on
              the server.
            </Text>
          </Card>
        ) : null}

        {data.request_status === 'completed' && !data.rating_stars ? (
          <Button
            label={data.viewer_is_requester ? 'Rate them' : 'Rate the person who asked'}
            size="lg"
            onPress={() => router.push(`/rate/${id}`)}
          />
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
              label="Cancel this request"
              variant="danger"
              loading={cancelRequest.isPending}
              onPress={confirmCancelRequest}
            />
          </View>
        ) : null}

        {canCancelAsHelper && !data.viewer_is_requester ? (
          <View className="gap-3">
            {cancelService.isError ? <InlineError error={cancelService.error} /> : null}
            <Button
              label="Cancel this request"
              variant="danger"
              loading={cancelService.isPending}
              onPress={confirmCancelService}
            />
          </View>
        ) : null}
      </ScrollView>

      <PersonProfileModal
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        userId={data.counterparty_id}
        displayName={data.counterparty_display_name}
        avatarPath={data.counterparty_avatar_path}
        ratingAverage={data.counterparty_rating_average}
        ratingCount={data.counterparty_rating_count}
        phoneVerified={Boolean(data.counterparty_phone)}
        profilePhotoVerified={Boolean(data.counterparty_avatar_path)}
      />

      <ReportProblemModal
        key={reportModal?.kind ?? 'closed'}
        visible={reportModal !== null}
        kind={reportModal?.kind ?? null}
        title={reportModal?.title ?? ''}
        subtitle={reportModal?.subtitle ?? ''}
        requiresDescription={reportModal ? disputeKindRequiresDescription(reportModal.kind) : false}
        loading={reportProblem.isPending || reportClientNoShow.isPending}
        onClose={() => setReportModal(null)}
        onSubmit={submitReport}
      />
    </Screen>
  );
}
