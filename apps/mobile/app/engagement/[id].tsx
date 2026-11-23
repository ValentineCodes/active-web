import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import {
  CompletionProofSheet,
  type CompletionProofFailure,
  type CompletionProofSheetHandle,
} from '@/components/request-flow/CompletionProofSheet';
import { ReportIssueModal } from '@/components/ReportIssueModal';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { RequestConnectionActions } from '@/components/request-flow/RequestConnectionActions';
import { RequestExactLocationCard } from '@/components/request-flow/RequestExactLocationCard';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { EngagementLifecycleCard } from '@/components/request-flow/EngagementLifecycleCard';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { EngagementMilestoneProgress } from '@/components/request-flow/EngagementMilestoneProgress';
import { resolveAgreedAmount } from '@/features/requests/payment-display';
import {
  useEngagementMilestones,
  useRequestPaymentStructure,
} from '@/features/requests/milestone-api';
import {
  canDismissFailureToStart,
  canDismissMissedDeliveryUi,
  dismissalConfirmationCopy,
  helperShowStartButton,
} from '@/features/requests/engagement-lifecycle';
import { requestEngagementStatusBadge } from '@/features/requests/status';
import { useMarkServiceComplete, useMyResponses, useStartRequest } from '@/features/requests/responses-api';
import {
  myRequestQueryOptions,
  useCompleteRequest,
  useContestServiceProblem,
  useDismissWorkerFailureToStart,
  useDismissWorkerMissedDelivery,
  useEngagement,
  useLiveRequest,
} from '@/features/requests/requester-api';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import {
  formatAgo,
  formatMoney,
  formatRequestOfferLocationLabel,
  formatCommitmentDayLabel,
  formatWhen,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';
import {
  invalidateConversationInboxQueries,
  useRequestConversation,
} from '@/features/requests/conversation-api';
import {
  abortCompletionProofSendSession,
  CompletionProofMessageSendFailedError,
  CompletionProofUploadFailedError,
  createCompletionProofSendSession,
  sendCompletionProofMessage,
  stageCompletionProofMedia,
  type CompletionProofSendSession,
  type CompletionProofStagedMedia,
} from '@/features/requests/send-completion-proof-message';
import { queryKeys } from '@/lib/query/keys';
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
  useQueryErrorToast(engagement, { enabled: engagement.isError && !engagement.data });
  const paymentStructure = useRequestPaymentStructure(id, Boolean(engagement.data));
  const engagementMilestones = useEngagementMilestones(
    id,
    paymentStructure.data === 'milestone',
  );
  const myResponses = useMyResponses();
  const markServiceComplete = useMarkServiceComplete(id);
  const startRequest = useStartRequest(id);
  const completeRequest = useCompleteRequest(id);
  const contestProblem = useContestServiceProblem(id);
  const dismissFailureToStart = useDismissWorkerFailureToStart(id);
  const dismissMissedDelivery = useDismissWorkerMissedDelivery(id);
  const myRequest = useQuery({
    ...myRequestQueryOptions(id),
    enabled: Boolean(engagement.data?.viewer_is_requester) && id.length > 0,
  });
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const completionProofSheetRef = useRef<CompletionProofSheetHandle>(null);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofFailure, setProofFailure] = useState<CompletionProofFailure | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const viewerIsRequesterRef = useRef(false);
  const completionActionLockRef = useRef(false);
  const startActionLockRef = useRef(false);
  const proofSendSessionRef = useRef<CompletionProofSendSession | null>(null);
  const queryClient = useQueryClient();
  const engagementSnapshot = engagement.data;
  const isMilestoneEngagement = paymentStructure.data === 'milestone';
  const helperCanMarkComplete =
    engagementSnapshot != null &&
    !engagementSnapshot.viewer_is_requester &&
    engagementSnapshot.request_status === 'in_progress' &&
    Boolean(engagementSnapshot.started_at) &&
    !isMilestoneEngagement;
  const requestConversation = useRequestConversation(id, Boolean(engagementSnapshot));

  const finishMarkingComplete = useCallback(() => {
    if (completionActionLockRef.current || markServiceComplete.isPending) return;

    completionActionLockRef.current = true;
    markServiceComplete.mutate(undefined, {
      onSuccess: () => {
        showAppToast('Waiting for confirmation', 'info');
        completionProofSheetRef.current?.dismiss();
        proofSendSessionRef.current = null;
        setProofFailure(null);
      },
      onSettled: () => {
        completionActionLockRef.current = false;
      },
    });
  }, [markServiceComplete]);

  const onCompletionProofSkip = useCallback(() => {
    completionProofSheetRef.current?.dismiss();
    finishMarkingComplete();
  }, [finishMarkingComplete]);

  const onStageCompletionProof = useCallback(
    (localFile: Parameters<typeof stageCompletionProofMedia>[0], kindHint: 'image' | 'video') =>
      stageCompletionProofMedia(localFile, kindHint),
    [],
  );

  const onDiscardCompletionProofPreview = useCallback(() => {
    void (async () => {
      const session = proofSendSessionRef.current;
      if (!session) return;
      try {
        await abortCompletionProofSendSession(session);
      } catch {
        showAppToast('Could not remove the pending proof upload.', 'warning');
      } finally {
        proofSendSessionRef.current = null;
        setProofFailure(null);
      }
    })();
  }, []);

  const onSendCompletionProof = useCallback(
    async (staged: CompletionProofStagedMedia) => {
      if (completionActionLockRef.current || proofBusy) return;

      const conversationId = requestConversation.data?.conversationId;
      if (!conversationId) {
        showAppToast('Chat is not ready yet. Try again in a moment.', 'warning');
        return;
      }

      if (!proofSendSessionRef.current) {
        proofSendSessionRef.current = createCompletionProofSendSession();
      }

      const session = proofSendSessionRef.current;
      completionActionLockRef.current = true;
      setProofBusy(true);
      setProofFailure(null);

      try {
        try {
          const updatedSession = await sendCompletionProofMessage({
            conversationId,
            staged,
            session,
          });
          proofSendSessionRef.current = updatedSession;

          await queryClient.invalidateQueries({ queryKey: queryKeys.requestConversation(id) });
          invalidateConversationInboxQueries(queryClient);
        } catch (error) {
          if (error instanceof CompletionProofUploadFailedError) {
            proofSendSessionRef.current = error.session;
            setProofFailure({ phase: 'upload', message: error.message });
            return;
          }
          if (error instanceof CompletionProofMessageSendFailedError) {
            proofSendSessionRef.current = error.session;
            setProofFailure({ phase: 'send', message: error.message });
            return;
          }
          const message =
            error instanceof Error ? error.message : 'Could not send your proof. Try again.';
          setProofFailure({ phase: 'upload', message });
          return;
        }

        try {
          await markServiceComplete.mutateAsync();
          showAppToast('Waiting for confirmation', 'info');
          proofSendSessionRef.current = null;
          setProofFailure(null);
          completionProofSheetRef.current?.dismiss();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Proof was sent but we could not mark this request complete. Try again.';
          showAppToast(message, 'warning');
        }
      } finally {
        setProofBusy(false);
        completionActionLockRef.current = false;
      }
    },
    [id, markServiceComplete, proofBusy, queryClient, requestConversation.data?.conversationId],
  );

  const openCompletionProofSheet = useCallback(() => {
    if (completionActionLockRef.current || markServiceComplete.isPending || proofBusy) return;
    proofSendSessionRef.current = null;
    setProofFailure(null);
    completionProofSheetRef.current?.present();
  }, [markServiceComplete.isPending, proofBusy]);

  useLiveRequest(id);

  useEffect(() => {
    if (!engagement.data) return;
    viewerIsRequesterRef.current = engagement.data.viewer_is_requester;
  }, [engagement.data]);

  useEffect(() => {
    if (engagement.data) return;
    if (!myRequest.data) return;
    const status = myRequest.data.status;
    if (status !== 'posted' && status !== 'awaiting_review') return;
    if (viewerIsRequesterRef.current) {
      router.replace(`/request/${id}`);
    }
  }, [engagement.data, id, myRequest.data]);

  const onPullRefresh = useCallback(() => engagement.refetch(), [engagement]);
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  if (showQuerySkeleton(engagement)) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (!engagement.data) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        {engagement.isError ? (
          <EmptyState
            icon="document-text-outline"
            title="Could not load"
            message="Go back and open this screen again."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        ) : (
          <EmptyState
            icon="lock-closed-outline"
            title="Nothing to show here"
            message="Choose someone on your request first. Then you will see contact details and the exact location here."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        )}
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

  const confirmStartRequest = () => {
    if (startActionLockRef.current || startRequest.isPending) return;
    Alert.alert(
      'Start helping?',
      'The delivery countdown and binding deadline are set on the server when you start. Make sure you can commit.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Start',
          onPress: () => {
            if (startActionLockRef.current || startRequest.isPending) return;
            startActionLockRef.current = true;
            startRequest.mutate(undefined, {
              onSuccess: () => {
                showAppToast('Work started', 'success');
              },
              onSettled: () => {
                startActionLockRef.current = false;
              },
            });
          },
        },
      ],
    );
  };

  const confirmDismiss = (kind: 'failure_to_start' | 'missed_delivery') => {
    const copy = dismissalConfirmationCopy(kind);
    const dismiss =
      kind === 'failure_to_start' ? dismissFailureToStart : dismissMissedDelivery;
    if (dismiss.isPending) return;

    Alert.alert(copy.title, `${copy.message}\n\n${copy.financialNote}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End engagement',
        style: 'destructive',
        onPress: () => {
          dismiss.mutate(undefined, {
            onSuccess: () => {
              showAppToast('Engagement ended', 'info');
            },
          });
        },
      },
    ]);
  };

  const showHelperStart =
    data != null &&
    helperShowStartButton({
      viewerIsRequester: data.viewer_is_requester,
      requestStatus: data.request_status,
      startedAt: data.started_at,
      startByAt: data.start_by_at ?? null,
    });

  const showDismissFailure =
    data != null &&
    canDismissFailureToStart({
      viewerIsRequester: data.viewer_is_requester,
      requestStatus: data.request_status,
      startedAt: data.started_at,
      startByAt: data.start_by_at ?? null,
    });

  const showDismissMissed =
    data != null &&
    canDismissMissedDeliveryUi({
      viewerIsRequester: data.viewer_is_requester,
      requestStatus: data.request_status,
      startedAt: data.started_at,
      deliveryDeadlineAt: data.delivery_deadline_at ?? null,
      paymentStatus: data.payment_status,
    });

  const showReportFooter =
    !inActiveFlow &&
    ((canReportActiveProblem && data.viewer_is_requester) || canReportHelperProblem);
  const showReportMenu = inActiveFlow || showReportFooter;
  const showRateFooter = data.request_status === 'completed' && !data.viewer_has_rated;
  const hasDismissFooter = showDismissFailure || showDismissMissed;
  const showHelperDoneButton =
    helperActive &&
    !isMilestoneEngagement &&
    ['accepted', 'in_progress'].includes(data.request_status);
  const showRequesterConfirmButton = requesterActive && !isMilestoneEngagement;
  const hasInActiveFlowFooter =
    inActiveFlow &&
    (showHelperDoneButton ||
      showRequesterConfirmButton ||
      markServiceComplete.isError ||
      completeRequest.isError);
  const hasFloatingFooter =
    hasInActiveFlowFooter ||
    showRateFooter ||
    showHelperStart ||
    hasDismissFooter;
  const openCounterpartyProfile = () => profileSheetRef.current?.present();

  return (
    <Screen>
      <RequestFlowHeader
        title={screenTitle}
        onBack={() => router.back()}
        menuActions={
          showReportMenu
            ? [
                {
                  label: 'Report an issue',
                  onPress: openReportIssue,
                  destructive: true,
                },
              ]
            : undefined
        }
      />

      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 p-5"
          contentContainerStyle={{
            paddingBottom: hasFloatingFooter ? footerHeight + 16 : 48,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

          <RequestTagsLine slugs={data.tag_slugs} />

          {requesterActive ? (
            <View className="gap-3">
              <Text className="text-lg font-bold text-ink">Attending your request</Text>
              <RequestPersonCard
                avatarPath={data.counterparty_avatar_path}
                name={data.counterparty_display_name}
                ratingAverage={data.counterparty_rating_average}
                ratingCount={data.counterparty_rating_count}
                completionPercent={data.counterparty_completion_percent}
                identityVerified={data.counterparty_identity_verified}
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
              identityVerified={data.counterparty_identity_verified}
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

          <EngagementLifecycleCard
            viewerIsRequester={data.viewer_is_requester}
            requestStatus={data.request_status}
            paymentStatus={data.payment_status}
            acceptedAt={data.accepted_at}
            startByAt={data.start_by_at ?? null}
            startedAt={data.started_at}
            proposedDeliveryDurationValue={data.proposed_delivery_duration_value ?? null}
            proposedDeliveryDurationUnit={data.proposed_delivery_duration_unit ?? null}
            proposedDeliveryAt={data.proposed_delivery_at ?? null}
            proposedDeliveryTimezone={data.proposed_delivery_timezone ?? null}
            adjustedDeliveryAt={data.adjusted_delivery_at ?? null}
            deliveryDeadlineAt={data.delivery_deadline_at ?? null}
          />

          {showPaymentSecured ? (
            <RequestCallout tone="info" title="Payment secured">
              <Text className="text-sm text-muted">
                {paymentStructure.data === 'milestone'
                  ? 'The full offer is locked. Milestone payouts release when you approve each step.'
                  : 'Release payment only after the request is complete.'}
              </Text>
            </RequestCallout>
          ) : null}

          {isMilestoneEngagement && agreedAmount !== null ? (
            <EngagementMilestoneProgress
              requestId={id}
              conversationId={requestConversation.data?.conversationId ?? null}
              milestones={engagementMilestones.data ?? []}
              currency={data.currency}
              viewerIsRequester={data.viewer_is_requester}
              paymentDisputed={data.payment_status === 'disputed' || data.request_status === 'disputed'}
              onOpenChat={() => router.push(`/conversation/${id}`)}
            />
          ) : null}

          {helperActive &&
          !isMilestoneEngagement &&
          data.request_status === 'in_progress' &&
          data.started_at ? (
            <RequestCallout
              tone="info"
              title={`You're committed to this request on ${formatCommitmentDayLabel(data.scheduled_for)}.`}
            >
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
            <RequestCallout tone="danger" title="Engagement ended — did not start">
              <Text className="text-sm text-muted">
                The helper did not press Start in time. Refunds follow the outcome recorded on the
                server (full locked amount returned to you; no service fee).
              </Text>
            </RequestCallout>
          ) : null}

          {data.request_status === 'cancelled' ? (
            <RequestCallout tone="danger" title="Engagement ended">
              <Text className="text-sm text-muted">
                This engagement was cancelled. Payment adjustments follow the server ledger.
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
        </ScrollView>

        {hasFloatingFooter ? (
          <View
            className="absolute bottom-0 left-0 right-0 gap-3 bg-transparent px-5 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          >
            {showHelperStart ? (
              <>
                {startRequest.isError ? <InlineError error={startRequest.error} /> : null}
                <Button
                  label="Start"
                  variant="active"
                  size="lg"
                  loading={startRequest.isPending}
                  disabled={startRequest.isPending}
                  onPress={confirmStartRequest}
                />
              </>
            ) : null}

            {hasDismissFooter ? (
              <>
                {dismissFailureToStart.isError ? (
                  <InlineError error={dismissFailureToStart.error} />
                ) : null}
                {dismissMissedDelivery.isError ? (
                  <InlineError error={dismissMissedDelivery.error} />
                ) : null}
                {showDismissFailure ? (
                  <Button
                    label="End — failed to start"
                    variant="danger"
                    size="lg"
                    loading={dismissFailureToStart.isPending}
                    disabled={dismissFailureToStart.isPending || dismissMissedDelivery.isPending}
                    onPress={() => confirmDismiss('failure_to_start')}
                  />
                ) : null}
                {showDismissMissed ? (
                  <Button
                    label="End — missed delivery"
                    variant="danger"
                    size="lg"
                    loading={dismissMissedDelivery.isPending}
                    disabled={dismissMissedDelivery.isPending || dismissFailureToStart.isPending}
                    onPress={() => confirmDismiss('missed_delivery')}
                  />
                ) : null}
              </>
            ) : null}

            {inActiveFlow ? (
              <>
                {markServiceComplete.isError ? (
                  <InlineError error={markServiceComplete.error} />
                ) : null}
                {completeRequest.isError ? <InlineError error={completeRequest.error} /> : null}
                {showHelperDoneButton ? (
                  <Button
                    label="I'm done"
                    variant="active"
                    size="lg"
                    loading={markServiceComplete.isPending || proofBusy}
                    disabled={markServiceComplete.isPending || proofBusy}
                    onPress={openCompletionProofSheet}
                  />
                ) : null}

                {showRequesterConfirmButton ? (
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
        identityVerified={data.counterparty_identity_verified}
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

      {helperCanMarkComplete ? (
        <CompletionProofSheet
          ref={completionProofSheetRef}
          busy={proofBusy || markServiceComplete.isPending}
          failure={proofFailure}
          onSkip={onCompletionProofSkip}
          onSendProof={onSendCompletionProof}
          onStageMedia={onStageCompletionProof}
          onDiscardPreview={onDiscardCompletionProofPreview}
          onDismiss={() => {
            void (async () => {
              const session = proofSendSessionRef.current;
              if (session && !session.messagePublished) {
                try {
                  await abortCompletionProofSendSession(session);
                } catch {
                  // Sheet is closing; avoid blocking dismissal.
                }
              }
              proofSendSessionRef.current = null;
              setProofFailure(null);
            })();
          }}
        />
      ) : null}
    </Screen>
  );
}
