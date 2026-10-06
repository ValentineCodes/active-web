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
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { ReportIssueModal } from '@/components/ReportIssueModal';
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
  useMarkServiceComplete,
  useMyResponses,
} from '@/features/requests/responses-api';
import {
  useCancelRequest,
  useCompleteRequest,
  useContestServiceProblem,
  useEngagement,
  useLiveRequest,
} from '@/features/requests/requester-api';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import {
  formatAgo,
  formatMoney,
  formatRequestOfferLocationLabel,
  formatWhen,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';
import { showAppToast } from '@/lib/toast';
function openInMaps(latitude: number, longitude: number, label: string) {
  const url = Platform.select({
    ios: `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });

  Linking.openURL(url);
}

/**
 * The connected screen. This is the only place exact coordinates and phone numbers are
 * shown, and it is reachable only after the requester chose someone to help — the server
 * refuses public.get_engagement for any earlier state.
 *
 * In-app chat is available from here for the life of the request conversation (including
 * after completion, read-only when the request is closed).
 */
export default function EngagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const engagement = useEngagement(id);
  const myResponses = useMyResponses();
  const markServiceComplete = useMarkServiceComplete(id);
  const completeRequest = useCompleteRequest(id);
  const contestProblem = useContestServiceProblem(id);
  const cancelRequest = useCancelRequest(id);
  const cancelService = useCancelService(id);
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
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

  if (data.request_status === 'completed' && data.viewer_is_requester) {
    return <Redirect href={`/request/${id}`} />;
  }

  const statusBadge = requestEngagementStatusBadge(data.request_status, {
    viewerIsRequester: data.viewer_is_requester,
  });
  const agreedAmount = resolveAgreedAmount({
    agreedAmount: data.agreed_provider_amount,
    quotedAmount: data.quoted_amount,
    offeredAmount: data.offered_amount,
  });
  const offerAmount = agreedAmount !== null ? formatMoney(agreedAmount, data.currency) : null;
  const helperDistanceM = data.viewer_is_requester
    ? null
    : myResponses.data?.find((row) => row.request_id === id && row.response_status === 'accepted')
        ?.distance_m;
  const offerLocationLabel = formatRequestOfferLocationLabel(data.location_label, helperDistanceM);
  const metaTime = formatAgo(
    data.started_at ?? data.accepted_at ?? data.handshake_at ?? new Date().toISOString(),
  );
  const screenTitle = data.viewer_is_requester ? 'Your request' : 'Request';
  const showPaymentSecured =
    data.viewer_is_requester &&
    (data.payment_status === 'locked' || data.payment_status === 'pending') &&
    data.request_status !== 'completed';

  const helperFirstName = data.counterparty_display_name?.split(' ')[0] ?? 'They';

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
              onSuccess: () => {
                showAppToast('Request cancelled');
                router.replace(`/request/${id}`);
              },
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
              onSuccess: () => {
                showAppToast('Request cancelled');
                router.back();
              },
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

  const openReportIssue = () => setReportIssueOpen(true);

  const showReportFooter =
    !inActiveFlow &&
    ((canReportActiveProblem && data.viewer_is_requester) || canReportHelperProblem);
  const showRateFooter = data.request_status === 'completed' && !data.viewer_has_rated;
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
              onRefresh={() => {
                void engagement.refetch();
              }}
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
              locationLabel={offerLocationLabel}
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

          <View className="gap-3">
            <RequestConnectionActions
              onChat={() => router.push(`/conversation/${id}`)}
              showCall={data.viewer_is_requester || helperActive}
              callDisabled={!data.counterparty_phone}
              onCall={() => Linking.openURL(`tel:${data.counterparty_phone}`)}
              onViewMap={openMaps}
            />
            <RequestExactLocationCard address={data.location_label} onDirections={openMaps} />
          </View>

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
              ratingComment={data.rating_comment}
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
                          {
                            text: 'Mark complete',
                            onPress: () =>
                              markServiceComplete.mutate(undefined, {
                                onSuccess: () => showAppToast('Waiting for confirmation', 'info'),
                              }),
                          },
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
                                onSuccess: () => {
                                  showAppToast('Request completed');
                                  router.replace(`/rate/${id}`);
                                },
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
                  onPress={openReportIssue}
                />
              </>
            ) : null}

            {showReportFooter ? (
              <>
                <Pressable accessibilityRole="button" onPress={openReportIssue}>
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

      <ReportIssueModal
        visible={reportIssueOpen}
        issues={REQUEST_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => {
          setReportIssueOpen(false);
          showAppToast('Thanks — we received your report');
        }}
      />
    </Screen>
  );
}
