import { useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { ReportProblemModal, type ReportProblemPayload } from '@/components/ReportProblemModal';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { RequestConnectionActions } from '@/components/request-flow/RequestConnectionActions';
import { RequestExactLocationCard } from '@/components/request-flow/RequestExactLocationCard';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { resolveAgreedAmount } from '@/features/requests/payment-display';
import { requestEngagementStatusBadge } from '@/features/requests/status';
import {
  useCancelService,
  useReportClientNoShow,
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
import {
  formatAgo,
  formatMoney,
  formatWhen,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';
function openInMaps(latitude: number, longitude: number, label: string) {
  const url = Platform.select({
    ios: `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });

  Linking.openURL(url);
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
  const markServiceComplete = useMarkServiceComplete(id);
  const completeRequest = useCompleteRequest(id);
  const reportProblem = useReportServiceProblem(id);
  const contestProblem = useContestServiceProblem(id);
  const reportClientNoShow = useReportClientNoShow(id);
  const cancelRequest = useCancelRequest(id);
  const cancelService = useCancelService(id);
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const [reportModal, setReportModal] = useState<ReportModalState | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useLiveRequest(id);

  if (engagement.isPending) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (engagement.isError) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <ErrorState error={engagement.error} onRetry={() => engagement.refetch()} />
      </Screen>
    );
  }

  if (!engagement.data) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
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
  const statusBadge = requestEngagementStatusBadge(data.request_status, {
    viewerIsRequester: data.viewer_is_requester,
  });
  const agreedAmount = resolveAgreedAmount({
    agreedAmount: data.agreed_provider_amount,
    quotedAmount: data.quoted_amount,
    offeredAmount: data.offered_amount,
  });
  const offerAmount = agreedAmount !== null ? formatMoney(agreedAmount, data.currency) : null;
  const metaTime = formatAgo(
    data.started_at ?? data.accepted_at ?? data.handshake_at ?? new Date().toISOString(),
  );
  const screenTitle = data.viewer_is_requester ? 'Your request' : 'Request';
  const showPaymentSecured =
    data.viewer_is_requester &&
    (data.payment_status === 'locked' || data.payment_status === 'pending') &&
    data.request_status !== 'completed';

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

  const menuActions: { label: string; onPress: () => void; destructive?: boolean }[] = [];
  if (canCancelAsRequester && data.viewer_is_requester) {
    menuActions.push({
      label: 'Cancel request',
      destructive: true,
      onPress: confirmCancelRequest,
    });
  }
  if (canCancelAsHelper && !data.viewer_is_requester) {
    menuActions.push({
      label: 'Cancel request',
      destructive: true,
      onPress: confirmCancelService,
    });
  }

  const helperActive =
    !data.viewer_is_requester &&
    ['accepted', 'in_progress', 'completion_pending'].includes(data.request_status);
  const requesterActive =
    data.viewer_is_requester &&
    ['accepted', 'in_progress', 'completion_pending'].includes(data.request_status);
  const inActiveFlow = helperActive || requesterActive;

  const openMaps = () =>
    openInMaps(data.request_latitude, data.request_longitude, data.location_label);

  const openReportIssue = () => {
    if (data.viewer_is_requester && data.request_status === 'completion_pending') {
      openReportModal({
        kind: 'completion_issue',
        title: 'Report a problem',
        subtitle:
          'This pauses payment until we review. Only do this if the work was not done as agreed.',
      });
      return;
    }
    if (data.viewer_is_requester) {
      openRequesterProblemMenu();
      return;
    }
    openHelperProblemMenu();
  };

  const showReportFooter =
    !inActiveFlow &&
    ((canReportActiveProblem && data.viewer_is_requester) || canReportHelperProblem);
  const showRateFooter = data.request_status === 'completed' && !data.rating_stars;
  const hasFloatingFooter = inActiveFlow || showReportFooter || showRateFooter;
  const openCounterpartyProfile = () => profileSheetRef.current?.present();

  return (
    <Screen>
      <RequestFlowHeader
        title={screenTitle}
        onBack={() => router.back()}
        menuActions={menuActions.length ? menuActions : undefined}
      />

      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 p-5"
          contentContainerStyle={{
            paddingBottom: hasFloatingFooter ? footerHeight + 16 : 48,
          }}
          refreshControl={
            <RefreshControl
              refreshing={engagement.isRefetching}
              onRefresh={() => engagement.refetch()}
            />
          }
        >
          <RequestMetaRow
            badgeLabel={statusBadge.label}
            badgeTone={statusBadge.tone}
            trailing={metaTime}
          />

          <RequestTitleSection title={data.title} description={data.description} />

          {offerAmount ? (
            <RequestOfferWhenCard
              amount={offerAmount}
              whenLabel={formatWhenRequestCard(data.scheduled_for)}
              whenDetail={formatWhenHome(data.scheduled_for)}
              locationLabel={data.location_label}
            />
          ) : null}

          {requesterActive ? (
            <View className="gap-3">
              <Text className="text-lg font-bold text-ink">Attending your request</Text>
              <RequestPersonCard
                avatarPath={data.counterparty_avatar_path}
                name={data.counterparty_display_name}
                ratingAverage={data.counterparty_rating_average}
                ratingCount={data.counterparty_rating_count}
                completionPercent={data.counterparty_completion_percent}
                onPress={openCounterpartyProfile}
              />
            </View>
          ) : (
            <RequestPersonCard
              avatarPath={data.counterparty_avatar_path}
              name={data.counterparty_display_name}
              ratingAverage={data.counterparty_rating_average}
              ratingCount={data.counterparty_rating_count}
              completionPercent={data.counterparty_completion_percent}
              onPress={openCounterpartyProfile}
            />
          )}

          {inActiveFlow ? (
            <View className="gap-3">
              <RequestConnectionActions
                chatDisabled={!data.counterparty_phone}
                callDisabled={!data.counterparty_phone}
                onChat={() => Linking.openURL(`sms:${data.counterparty_phone}`)}
                onCall={() => Linking.openURL(`tel:${data.counterparty_phone}`)}
                onViewMap={openMaps}
              />
              <RequestExactLocationCard address={data.location_label} onDirections={openMaps} />
            </View>
          ) : null}

          {showPaymentSecured ? (
            <RequestCallout tone="info" title="Payment secured">
              <Text className="text-sm text-muted">
                Release payment only after the request is complete.
              </Text>
            </RequestCallout>
          ) : null}

          {helperActive ? (
            <RequestCallout tone="info" title="You’re attending this request">
              <Text className="text-sm text-muted">
                Payment is secured. Mark it done when the work is complete.
              </Text>
            </RequestCallout>
          ) : null}

          {!inActiveFlow && data.counterparty_phone ? (
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

          {!inActiveFlow ? (
            <Button label="Open in Maps" variant="secondary" icon="navigate" onPress={openMaps} />
          ) : null}

          {data.viewer_is_requester && data.request_status === 'completion_pending' ? (
            <RequestCallout tone="warning" title={`${helperFirstName} says it’s complete`}>
              <Text className="text-sm text-muted">
                Confirm only if the work was done as agreed.
              </Text>
              {data.completion_confirm_by ? (
                <Text className="text-sm text-muted">
                  If you don&apos;t respond by {formatWhen(data.completion_confirm_by)}, this
                  request will complete automatically.
                </Text>
              ) : null}
            </RequestCallout>
          ) : null}

          {!data.viewer_is_requester && data.request_status === 'completion_pending' ? (
            <RequestCallout tone="info" title="Waiting for confirmation">
              <Text className="text-sm text-muted">
                They can rate you once they confirm the request is complete.
              </Text>
            </RequestCallout>
          ) : null}

          {data.request_status === 'disputed' ? (
            <RequestCallout tone="danger" title={problemKindLabel(data.service_problem_kind)}>
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
                      If they do not respond by {formatWhen(data.service_problem_respond_by)}, the
                      app will resolve this automatically.
                    </>
                  ) : null}
                </Text>
              ) : (
                <Text className="text-sm text-muted">
                  Respond if this is wrong.
                  {data.service_problem_respond_by ? (
                    <>
                      {' '}
                      You have until {formatWhen(data.service_problem_respond_by)} before an
                      automatic outcome.
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
            </RequestCallout>
          ) : null}

          {data.request_status === 'no_show' ? (
            <RequestCallout tone="danger" title="No-show recorded">
              <Text className="text-sm text-muted">
                This request closed after a no-show report. Payment followed the outcome recorded on
                the server.
              </Text>
            </RequestCallout>
          ) : null}

          {data.request_status === 'completed' ? (
            <RequestCompletionCard
              completedAtLabel={
                data.completed_at
                  ? format(new Date(data.completed_at), "EEEE, d MMM 'at' h:mm a")
                  : 'Completed'
              }
              ratingStars={data.rating_stars}
            />
          ) : null}

          {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
          {cancelService.isError ? <InlineError error={cancelService.error} /> : null}
        </ScrollView>

        {hasFloatingFooter ? (
          <View
            className="absolute bottom-0 left-0 right-0 gap-3 border-t border-hairline bg-canvas px-5 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          >
            {inActiveFlow ? (
              <>
                {markServiceComplete.isError ? (
                  <InlineError error={markServiceComplete.error} />
                ) : null}
                {completeRequest.isError ? <InlineError error={completeRequest.error} /> : null}
                {reportProblem.isError ? <InlineError error={reportProblem.error} /> : null}
                {reportClientNoShow.isError ? (
                  <InlineError error={reportClientNoShow.error} />
                ) : null}

                {helperActive && ['accepted', 'in_progress'].includes(data.request_status) ? (
                  <Button
                    label="I'm done"
                    variant="active"
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
                ) : null}

                {requesterActive ? (
                  <Button
                    label="Confirm completion"
                    variant="active"
                    size="lg"
                    loading={completeRequest.isPending}
                    disabled={data.request_status !== 'completion_pending'}
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
                ) : null}

                <Button
                  label="Report an issue"
                  variant="danger"
                  size="lg"
                  loading={reportProblem.isPending || reportClientNoShow.isPending}
                  onPress={openReportIssue}
                />
              </>
            ) : null}

            {showReportFooter ? (
              <>
                {reportProblem.isError ? <InlineError error={reportProblem.error} /> : null}
                {reportClientNoShow.isError ? (
                  <InlineError error={reportClientNoShow.error} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={openReportIssue}
                  disabled={reportProblem.isPending || reportClientNoShow.isPending}
                >
                  <Text className="text-center text-base font-semibold text-danger">
                    Report an issue
                  </Text>
                </Pressable>
              </>
            ) : null}

            {showRateFooter ? (
              <Button
                label={data.viewer_is_requester ? 'Rate them' : 'Rate the person who asked'}
                variant="active"
                size="lg"
                onPress={() => router.push(`/rate/${id}`)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <PersonProfileBottomSheet
        key={data.counterparty_id}
        sheetRef={profileSheetRef}
        userId={data.counterparty_id}
        displayName={data.counterparty_display_name}
        avatarPath={data.counterparty_avatar_path}
        bio={data.counterparty_bio}
        ratingAverage={data.counterparty_rating_average}
        ratingCount={data.counterparty_rating_count}
        completionPercent={data.counterparty_completion_percent}
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
