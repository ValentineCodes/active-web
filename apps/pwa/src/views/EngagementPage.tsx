'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  PersonProfileSheet,
  type PersonProfilePreview,
} from '@/components/profile/PersonProfileSheet';
import {
  CompletionProofSheet,
  type CompletionProofFailure,
} from '@/components/request-flow/CompletionProofSheet';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { RequestConnectionActions } from '@/components/request-flow/RequestConnectionActions';
import { RequestExactLocationCard } from '@/components/request-flow/RequestExactLocationCard';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { ReportIssueModal } from '@/components/support/ReportIssueModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { EngagementMilestoneProgress } from '@/components/request-flow/EngagementMilestoneProgress';
import { resolveAgreedAmount } from '@/features/requests/payment-display';
import {
  useEngagementMilestones,
  useRequestPaymentStructure,
} from '@/features/requests/milestone-api';
import {
  invalidateConversationInboxQueries,
  useRequestConversation,
} from '@/features/requests/conversation-api';
import { useMarkServiceComplete, useMyResponses } from '@/features/requests/responses-api';
import {
  myRequestQueryOptions,
  useCompleteRequest,
  useContestServiceProblem,
  useEngagement,
  useLiveRequest,
} from '@/features/requests/requester-api';
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
import { requestEngagementStatusBadge } from '@/features/requests/status';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { messageThreadHref } from '@/lib/conversation-navigation';
import {
  formatAgo,
  formatCommitmentDayLabel,
  formatMoney,
  formatRequestOfferLocationLabel,
  formatWhen,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';
import { useRouter } from '@/lib/navigation';
import { queryKeys } from '@/lib/query/keys';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';

function problemKindLabel(kind: string | null) {
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
}

function openInMaps(latitude: number, longitude: number) {
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function EngagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useRouteParam('id');

  const engagement = useEngagement(id);
  const paymentStructure = useRequestPaymentStructure(id, Boolean(engagement.data));
  const engagementMilestones = useEngagementMilestones(
    id,
    paymentStructure.data === 'milestone',
  );
  const myResponses = useMyResponses();
  const markServiceComplete = useMarkServiceComplete(id);
  const completeRequest = useCompleteRequest(id);
  const contestProblem = useContestServiceProblem(id);

  const viewerIsRequesterRef = useRef(false);
  const completionActionLockRef = useRef(false);
  const proofSendSessionRef = useRef<CompletionProofSendSession | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);

  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [proofSheetOpen, setProofSheetOpen] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofFailure, setProofFailure] = useState<CompletionProofFailure | null>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [contestOpen, setContestOpen] = useState(false);
  const [counterpartyProfile, setCounterpartyProfile] = useState<PersonProfilePreview | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  const engagementSnapshot = engagement.data;
  const isMilestoneEngagement = paymentStructure.data === 'milestone';
  const helperCanMarkComplete =
    engagementSnapshot != null &&
    !engagementSnapshot.viewer_is_requester &&
    ['accepted', 'in_progress'].includes(engagementSnapshot.request_status) &&
    !isMilestoneEngagement;
  const requestConversation = useRequestConversation(id, Boolean(engagementSnapshot));

  const myRequest = useQuery({
    ...myRequestQueryOptions(id),
    enabled: Boolean(engagement.data?.viewer_is_requester) && id.length > 0,
  });

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
  }, [engagement.data, id, myRequest.data, router]);

  const finishMarkingComplete = useCallback(() => {
    if (completionActionLockRef.current || markServiceComplete.isPending) return;

    completionActionLockRef.current = true;
    markServiceComplete.mutate(undefined, {
      onSuccess: () => {
        showAppToast('Waiting for confirmation', 'info');
        setProofSheetOpen(false);
        proofSendSessionRef.current = null;
        setProofFailure(null);
      },
      onSettled: () => {
        completionActionLockRef.current = false;
      },
    });
  }, [markServiceComplete]);

  const onCompletionProofSkip = useCallback(() => {
    setProofSheetOpen(false);
    finishMarkingComplete();
  }, [finishMarkingComplete]);

  const onDiscardCompletionProofPreview = useCallback(() => {
    void (async () => {
      const session = proofSendSessionRef.current;
      if (!session) return;
      try {
        await abortCompletionProofSendSession(session);
      } catch {
        showAppToast('Could not remove the pending proof upload.', { type: 'warning' });
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
        showAppToast('Chat is not ready yet. Try again in a moment.', { type: 'warning' });
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
          setProofSheetOpen(false);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Proof was sent but we could not mark this request complete. Try again.';
          showAppToast(message, { type: 'warning' });
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
    setProofSheetOpen(true);
  }, [markServiceComplete.isPending, proofBusy]);

  useEffect(() => {
    const node = footerRef.current;
    if (!node) {
      setFooterHeight(0);
      return;
    }
    const measure = () => setFooterHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [engagement.data?.request_status, engagement.data?.viewer_is_requester]);

  if (showQuerySkeleton(engagement)) {
    return (
      <Screen className="flex min-h-[100dvh] flex-col">
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (!engagement.data) {
    return (
      <Screen className="flex min-h-[100dvh] flex-col">
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        {engagement.isError ? (
          <EmptyState
            layout="list"
            icon="alert-circle"
            title="Could not load"
            message="Go back and open this screen again."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        ) : (
          <EmptyState
            layout="list"
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
    return <Navigate to={`/request/${id}`} replace />;
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

  const canReportActiveProblem =
    data.request_status === 'accepted' || data.request_status === 'in_progress';
  const canReportHelperProblem =
    !data.viewer_is_requester &&
    (canReportActiveProblem || data.request_status === 'completion_pending');
  const showReportFooter =
    !inActiveFlow &&
    ((canReportActiveProblem && data.viewer_is_requester) || canReportHelperProblem);
  const showRateFooter = data.request_status === 'completed' && !data.viewer_has_rated;
  const hasFloatingFooter = inActiveFlow || showReportFooter || showRateFooter;

  const openMaps = () => openInMaps(data.request_latitude, data.request_longitude);

  const returnToEngagement = `/engagement/${id}`;
  const chatHref = messageThreadHref(id, returnToEngagement);

  const counterpartyPreview: PersonProfilePreview = {
    userId: data.counterparty_id,
    displayName: data.counterparty_display_name,
    avatarPath: data.counterparty_avatar_path,
    bio: data.counterparty_bio,
    ratingAverage: data.counterparty_rating_average,
    ratingCount: data.counterparty_rating_count,
    completionPercent: data.counterparty_completion_percent,
    identityVerified: data.counterparty_identity_verified ?? false,
  };

  return (
    <Screen className="flex min-h-[100dvh] flex-col">
      <RequestFlowHeader title={screenTitle} onBack={() => router.back()} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ paddingBottom: hasFloatingFooter ? footerHeight + 16 : 48 }}
        >
          <div className="flex flex-col gap-6 p-5">
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
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-bold text-ink">Attending your request</h2>
                <RequestPersonCard
                  avatarPath={data.counterparty_avatar_path}
                  name={data.counterparty_display_name}
                  ratingAverage={data.counterparty_rating_average}
                  ratingCount={data.counterparty_rating_count}
                  completionPercent={data.counterparty_completion_percent}
                  onPress={() => setCounterpartyProfile(counterpartyPreview)}
                />
              </div>
            ) : (
              <RequestPersonCard
                avatarPath={data.counterparty_avatar_path}
                name={data.counterparty_display_name}
                ratingAverage={data.counterparty_rating_average}
                ratingCount={data.counterparty_rating_count}
                completionPercent={data.counterparty_completion_percent}
                onPress={() => setCounterpartyProfile(counterpartyPreview)}
              />
            )}

            <div className="flex flex-col gap-3">
              <RequestConnectionActions
                onChat={() => router.push(chatHref)}
                showCall={data.viewer_is_requester || helperActive}
                callDisabled={!data.counterparty_phone}
                onCall={() => {
                  if (data.counterparty_phone) window.location.href = `tel:${data.counterparty_phone}`;
                }}
                onViewMap={openMaps}
              />
              <RequestExactLocationCard address={data.location_label} onDirections={openMaps} />
            </div>

            {showPaymentSecured ? (
              <RequestCallout tone="info" title="Payment secured">
                <p className="text-sm text-muted">
                  {isMilestoneEngagement
                    ? 'The full offer is locked. Milestone payouts release when you approve each step.'
                    : 'Release payment only after the request is complete.'}
                </p>
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
                onOpenChat={() => router.push(chatHref)}
              />
            ) : null}

            {helperActive && !isMilestoneEngagement ? (
              <RequestCallout
                tone="info"
                title={`You're committed to this request on ${formatCommitmentDayLabel(data.scheduled_for)}.`}
              >
                <p className="text-sm text-muted">
                  Payment is secured. Mark it done when the work is complete.
                </p>
              </RequestCallout>
            ) : null}

            {data.viewer_is_requester && data.request_status === 'completion_pending' ? (
              <RequestCallout tone="warning" title={`${helperFirstName} says it’s complete`}>
                <p className="text-sm text-muted">Confirm only if the work was done as agreed.</p>
                {data.completion_confirm_by ? (
                  <p className="text-sm text-muted">
                    If you don&apos;t respond by {formatWhen(data.completion_confirm_by)}, this request
                    will complete automatically.
                  </p>
                ) : null}
              </RequestCallout>
            ) : null}

            {!data.viewer_is_requester && data.request_status === 'completion_pending' ? (
              <RequestCallout tone="info" title="Waiting for confirmation">
                <p className="text-sm text-muted">
                  They can rate you once they confirm the request is complete.
                </p>
              </RequestCallout>
            ) : null}

            {data.request_status === 'disputed' ? (
              <RequestCallout tone="danger" title={problemKindLabel(data.service_problem_kind)}>
                {data.service_problem_kind === 'completion_issue' ||
                data.service_problem_kind === 'service_not_completed' ||
                data.service_problem_kind === 'service_differs_from_request' ||
                data.service_problem_kind === 'other' ? (
                  <p className="text-sm text-muted">
                    Support will review this. Your payment stays on hold until this is resolved.
                    {data.service_problem_description ? (
                      <> You reported: “{data.service_problem_description}”</>
                    ) : null}
                  </p>
                ) : data.service_problem_reported_by_me ? (
                  <p className="text-sm text-muted">
                    We notified the other person. Your payment stays on hold while they have time to
                    respond.
                    {data.service_problem_respond_by ? (
                      <>
                        {' '}
                        If they do not respond by {formatWhen(data.service_problem_respond_by)}, the app
                        will resolve this automatically.
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted">
                    Respond if this is wrong.
                    {data.service_problem_respond_by ? (
                      <>
                        {' '}
                        You have until {formatWhen(data.service_problem_respond_by)} before an automatic
                        outcome.
                      </>
                    ) : null}
                  </p>
                )}
                {contestProblem.isError ? <InlineError error={contestProblem.error} /> : null}
                {canContestProblem ? (
                  <Button
                    label="I was there / I'm available"
                    variant="secondary"
                    loading={contestProblem.isPending}
                    onClick={() => setContestOpen(true)}
                  />
                ) : null}
              </RequestCallout>
            ) : null}

            {data.request_status === 'no_show' ? (
              <RequestCallout tone="danger" title="No-show recorded">
                <p className="text-sm text-muted">
                  This request closed after a no-show report. Payment followed the outcome recorded on
                  the server.
                </p>
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
          </div>
        </div>

        {hasFloatingFooter ? (
          <div
            ref={footerRef}
            className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 border-t border-hairline bg-canvas px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {inActiveFlow ? (
              <>
                {markServiceComplete.isError ? <InlineError error={markServiceComplete.error} /> : null}
                {completeRequest.isError ? <InlineError error={completeRequest.error} /> : null}
                {helperActive &&
                !isMilestoneEngagement &&
                ['accepted', 'in_progress'].includes(data.request_status) ? (
                  <Button
                    label="I'm done"
                    variant="active"
                    size="lg"
                    corner="2xl"
                    loading={markServiceComplete.isPending || proofBusy}
                    disabled={markServiceComplete.isPending || proofBusy}
                    onClick={openCompletionProofSheet}
                  />
                ) : null}

                {requesterActive && !isMilestoneEngagement ? (
                  <Button
                    label="Confirm completion"
                    variant="active"
                    size="lg"
                    corner="2xl"
                    loading={completeRequest.isPending}
                    disabled={data.request_status !== 'completion_pending'}
                    onClick={() => setConfirmCompleteOpen(true)}
                  />
                ) : null}

                <Button
                  label="Report an issue"
                  variant="danger"
                  size="lg"
                  corner="2xl"
                  onClick={() => setReportIssueOpen(true)}
                />
              </>
            ) : null}

            {showReportFooter ? (
              <button
                type="button"
                className="py-1 text-center text-base font-semibold text-danger active:opacity-80"
                onClick={() => setReportIssueOpen(true)}
              >
                Report an issue
              </button>
            ) : null}

            {showRateFooter ? (
              <Button
                label={data.viewer_is_requester ? 'Rate them' : 'Rate the person who asked'}
                variant="active"
                size="lg"
                corner="2xl"
                onClick={() => router.push(`/rate/${id}`)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <PersonProfileSheet
        open={counterpartyProfile != null}
        profile={counterpartyProfile}
        onClose={() => setCounterpartyProfile(null)}
      />

      <ReportIssueModal
        open={reportIssueOpen}
        issues={REQUEST_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => showAppToast('Thanks — we received your report')}
      />

      {helperCanMarkComplete ? (
        <CompletionProofSheet
          open={proofSheetOpen}
          onClose={() => {
            void (async () => {
              const session = proofSendSessionRef.current;
              if (session && !session.messagePublished) {
                try {
                  await abortCompletionProofSendSession(session);
                } catch {
                  // Allow dismiss without blocking.
                }
              }
              proofSendSessionRef.current = null;
              setProofFailure(null);
              setProofSheetOpen(false);
            })();
          }}
          busy={proofBusy || markServiceComplete.isPending}
          failure={proofFailure}
          onSkip={onCompletionProofSkip}
          onSendProof={onSendCompletionProof}
          onStageMedia={stageCompletionProofMedia}
          onDiscardPreview={onDiscardCompletionProofPreview}
        />
      ) : null}

      <BottomSheet
        open={confirmCompleteOpen}
        onClose={() => {
          if (completeRequest.isPending) return;
          setConfirmCompleteOpen(false);
        }}
        elevated
        dismissible={!completeRequest.isPending}
        footer={
          <div className="flex flex-row gap-3">
            <Button
              label="Not yet"
              variant="secondary"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              disabled={completeRequest.isPending}
              onClick={() => setConfirmCompleteOpen(false)}
            />
            <Button
              label="Confirm"
              variant="active"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              loading={completeRequest.isPending}
              onClick={() =>
                completeRequest.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmCompleteOpen(false);
                    showAppToast('Request completed');
                    router.replace(`/rate/${id}`);
                  },
                })
              }
            />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-ink">Confirm and pay them?</h2>
          <p className="text-base leading-6 text-muted">Only confirm if the work was done as agreed.</p>
        </div>
      </BottomSheet>

      <BottomSheet
        open={contestOpen}
        onClose={() => {
          if (contestProblem.isPending) return;
          setContestOpen(false);
        }}
        elevated
        dismissible={!contestProblem.isPending}
        footer={
          <div className="flex flex-row gap-3">
            <Button
              label="Cancel"
              variant="secondary"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              disabled={contestProblem.isPending}
              onClick={() => setContestOpen(false)}
            />
            <Button
              label="I was there"
              variant="active"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              loading={contestProblem.isPending}
              onClick={() =>
                contestProblem.mutate(undefined, {
                  onSuccess: () => setContestOpen(false),
                })
              }
            />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-ink">Dispute this report?</h2>
          <p className="text-base leading-6 text-muted">
            Tell us you were available and want to continue. This pauses any automatic outcome until
            support reviews it.
          </p>
        </div>
      </BottomSheet>
    </Screen>
  );
}