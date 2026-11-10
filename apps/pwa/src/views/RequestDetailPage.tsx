'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addHours, format } from 'date-fns';

import { ResponseCard } from '@/components/ResponseCard';
import { ReportIssueModal } from '@/components/support/ReportIssueModal';
import { ExtendResponseDeadlineSheet } from '@/components/request-flow/ExtendResponseDeadlineSheet';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import {
  ResponderProfileSheet,
  type ResponderProfileSheetActions,
} from '@/components/request-flow/ResponderProfileSheet';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { REQUEST_MAX_LIFETIME_HOURS } from '@/features/domain/model';
import { myRequestActivityBadge } from '@/features/requests/activity-list';
import { useOpenPreHandshakeConversation } from '@/features/requests/conversation-api';
import { isRequestEditable } from '@/features/requests/edit-eligibility';
import { partitionRequestResponsesForRequester } from '@/features/requests/request-response-sections';
import {
  useAcceptResponse,
  useCancelRequest,
  useDeclineResponse,
  useExtendRequest,
  useLiveRequest,
  useMyRequest,
  useOwnerExpireRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import {
  canReuseRequest,
  isAwaitingReviewRequestView,
  isExpiredRequestView,
  reuseRequestButtonLabelForRequest,
} from '@/features/requests/reuse';
import { chooseResponderDialog } from '@/features/requests/selection-copy';
import { responseStatusBadge } from '@/features/requests/status';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { useMyWallet } from '@/features/wallet/api';
import { walletLockAmountMajor, walletTopUpPath } from '@/features/wallet/top-up';
import { isInsufficientWalletBalanceError, toUserMessage } from '@/lib/supabase/errors';
import {
  formatAgo,
  formatMoney,
  formatRequestOfferLocationLabel,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';
import { useRouteParam } from '@/lib/route-param';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { showAppToast } from '@/lib/toast';

type ResponderProfilePreview = {
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  identityVerified: boolean;
  pendingResponse?: {
    responseId: string;
    responderAvailable: boolean;
  };
};

export function RequestDetailPage() {
  const router = useRouter();
  const id = useRouteParam('id');
  const [profilePreview, setProfilePreview] = useState<ResponderProfilePreview | null>(null);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [extendSheetOpen, setExtendSheetOpen] = useState(false);
  const [extendDeadlineAt, setExtendDeadlineAt] = useState(() => addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS));

  const request = useMyRequest(id);
  const responses = useRequestResponses(id);
  const cancelRequest = useCancelRequest(id);
  const extendRequest = useExtendRequest(id);
  const ownerExpireRequest = useOwnerExpireRequest(id);
  const acceptResponse = useAcceptResponse(id);
  const declineResponse = useDeclineResponse(id);
  const openPreHandshakeChat = useOpenPreHandshakeConversation();
  const wallet = useMyWallet();

  useLiveRequest(id);

  useEffect(() => {
    if (!id) return;
    void request.refetch();
    void responses.refetch();
    void wallet.refetch();
  }, [id, request.refetch, responses.refetch, wallet.refetch]);

  useEffect(() => {
    const row = request.data;
    if (!row) return;
    if (['completion_pending', 'disputed', 'no_show'].includes(row.status)) {
      router.replace(`/engagement/${id}`);
    }
  }, [id, request.data, router]);

  const dismissProfile = useCallback(() => {
    setProfilePreview(null);
  }, []);

  const showInsufficientWalletConfirm = useCallback(
    (error: unknown, requiredLockMajor: number) => {
      const addMoney = window.confirm(
        `${toUserMessage(error)}\n\nAdd money to your wallet now?`,
      );
      if (addMoney) {
        router.push(
          walletTopUpPath({
            returnTo: `/request/${id}`,
            requiredLockMajor,
            availableMajor: wallet.data?.available ?? 0,
          }),
        );
      }
    },
    [id, router, wallet.data?.available],
  );

  const discussResponse = useCallback(
    (responseId: string) => {
      void openPreHandshakeChat.mutateAsync(responseId).then((conversationId) => {
        dismissProfile();
        router.push(`/conversation/${conversationId}`);
      });
    },
    [dismissProfile, openPreHandshakeChat, router],
  );

  const acceptResponder = useCallback(
    (responseId: string, onAccepted?: () => void) => {
      const offered = request.data?.offered_amount;
      if (offered == null) return;

      const quoted =
        responses.data?.find((row) => row.response_id === responseId)?.quoted_amount ?? null;
      const requiredLockMajor = walletLockAmountMajor({
        offeredAmount: offered,
        quotedAmount: quoted,
      });

      acceptResponse.mutate(responseId, {
        onSuccess: () => {
          onAccepted?.();
          showAppToast('Helper confirmed — open the engagement for chat and details', 'info');
        },
        onError: (error) => {
          if (isInsufficientWalletBalanceError(error)) {
            dismissProfile();
            showInsufficientWalletConfirm(error, requiredLockMajor);
          }
        },
      });
    },
    [
      acceptResponse,
      dismissProfile,
      request.data?.offered_amount,
      responses.data,
      showInsufficientWalletConfirm,
    ],
  );

  if (showQuerySkeleton(request)) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const data = request.data;
  if (!data) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        {request.isError ? (
          <div className="px-5">
            <InlineError
              message={request.error instanceof Error ? request.error.message : 'Request not found.'}
            />
          </div>
        ) : (
          <LoadingState />
        )}
      </Screen>
    );
  }

  if (['completion_pending', 'disputed', 'no_show'].includes(data.status)) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const badge = myRequestActivityBadge({
    status: data.status,
    expires_at: data.expires_at,
    pending_response_count: data.pending_response_count,
  });
  const isAwaitingReview = isAwaitingReviewRequestView(data.status, data.expires_at);
  const isExpiredRequest = isExpiredRequestView(data.status, data.expires_at);
  const isOpen =
    (data.status === 'posted' || data.status === 'searching') && !isAwaitingReview && !isExpiredRequest;
  const responseSections = partitionRequestResponsesForRequester(responses.data ?? [], data.status, {
    isAwaitingReview,
    isExpiredRequest,
  });
  const pending = responseSections.selectablePending;
  const acceptedProvider = responseSections.accepted;
  const amount = data.offered_amount !== null ? formatMoney(data.offered_amount, data.currency) : null;
  const metaTime = formatAgo(data.updated_at ?? data.created_at);
  const reuseLabel = canReuseRequest(data.status, data.expires_at)
    ? reuseRequestButtonLabelForRequest(data.status, data.expires_at)
    : null;

  const confirmCancel = () => {
    const confirmed = window.confirm(
      'Cancel request?\n\nAnyone who responded will be told it is no longer open.',
    );
    if (!confirmed) return;
    cancelRequest.mutate(undefined, {
      onSuccess: () => showAppToast('Request cancelled'),
    });
  };

  const canEdit = isRequestEditable({
    status: data.status,
    expires_at: data.expires_at,
    accepted_at: data.accepted_at,
    pending_response_count: data.pending_response_count,
    is_editable: data.is_editable,
  });

  const menuActions = isOpen
    ? [
        ...(canEdit
          ? [{ label: 'Edit request', onPress: () => router.push(`/request/new?edit=${id}`) }]
          : []),
        { label: 'Cancel request', destructive: true as const, onPress: confirmCancel },
      ]
    : isAwaitingReview
      ? [{ label: 'Cancel request', destructive: true as const, onPress: confirmCancel }]
      : undefined;

  const openExtendDeadline = () => {
    setExtendDeadlineAt(addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS));
    setExtendSheetOpen(true);
  };

  const submitExtendDeadline = () => {
    if (extendDeadlineAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      showAppToast('Choose a deadline at least 5 minutes from now.', 'warning');
      return;
    }

    extendRequest.mutate(extendDeadlineAt, {
      onSuccess: () => {
        setExtendSheetOpen(false);
        showAppToast('Request extended for new responses');
      },
    });
  };

  const confirmExpireRequest = () => {
    const confirmed = window.confirm(
      'Close this request?\n\nIt will stop accepting new responses. You can still view responses and history.',
    );
    if (!confirmed) return;
    ownerExpireRequest.mutate(undefined, {
      onSuccess: () => showAppToast('Request closed'),
    });
  };

  type ListedResponse = NonNullable<typeof responses.data>[number];

  const responderProfileFromResponse = (
    response: ListedResponse,
    allowSelection: boolean,
  ): ResponderProfilePreview => ({
    userId: response.responder_id,
    displayName: response.display_name,
    avatarPath: response.avatar_path,
    bio: response.bio,
    ratingAverage: response.rating_average,
    ratingCount: response.rating_count,
    completionPercent: response.completion_percent,
    identityVerified: Boolean(response.identity_verified),
    pendingResponse: allowSelection
      ? {
          responseId: response.response_id,
          responderAvailable: Boolean(response.responder_available),
        }
      : undefined,
  });

  const renderResponseCard = (
    response: ListedResponse,
    options: {
      allowSelection: boolean;
      statusLabel?: string;
      statusTone?: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';
    },
  ) => (
    <ResponseCard
      key={response.response_id}
      displayName={response.display_name}
      avatarPath={response.avatar_path}
      ratingAverage={response.rating_average}
      ratingCount={response.rating_count}
      completionPercent={response.completion_percent}
      onViewProfile={() =>
        setProfilePreview(responderProfileFromResponse(response, options.allowSelection))
      }
      message={response.message}
      quotedAmount={response.quoted_amount}
      currency={data.currency}
      createdAt={response.created_at}
      responderAvailable={Boolean(response.responder_available)}
      statusLabel={options.statusLabel}
      statusTone={options.statusTone}
      onDiscussPress={
        options.allowSelection ? () => discussResponse(response.response_id) : undefined
      }
      discussLoading={
        options.allowSelection &&
        openPreHandshakeChat.isPending &&
        openPreHandshakeChat.variables === response.response_id
      }
    />
  );

  const showResponsePanels =
    isOpen ||
    isAwaitingReview ||
    responseSections.hasActiveEngagement ||
    responseSections.withdrawn.length > 0 ||
    responseSections.declined.length > 0;

  const profileSheetActions: ResponderProfileSheetActions | undefined =
    profilePreview?.pendingResponse && responseSections.canAccept
      ? {
          responderAvailable: profilePreview.pendingResponse.responderAvailable,
          acceptLoading: acceptResponse.isPending,
          declineLoading: declineResponse.isPending,
          onDecline: (reason) =>
            declineResponse.mutate(
              { responseId: profilePreview.pendingResponse!.responseId, reason },
              {
                onSuccess: () => {
                  dismissProfile();
                  showAppToast('Declined');
                },
              },
            ),
          onAccept: () => {
            const dialog = chooseResponderDialog(profilePreview.displayName);
            const confirmed = window.confirm(`${dialog.title}\n\n${dialog.message}`);
            if (!confirmed) return;
            const responseId = profilePreview.pendingResponse!.responseId;
            acceptResponder(responseId, dismissProfile);
          },
        }
      : undefined;

  return (
    <Screen>
      <RequestFlowHeader
        title="Your request"
        onBack={() => router.back()}
        menuActions={menuActions}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 pb-12">
        <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing={metaTime} />

        <RequestTitleSection title={data.title} description={data.description} />

        <RequestAttachmentSection attachmentPath={data.attachment_path} />

        {amount ? (
          <RequestOfferWhenCard
            amount={amount}
            whenLabel={formatWhenRequestCard(data.scheduled_for)}
            whenDetail={formatWhenHome(data.scheduled_for)}
            locationLabel={formatRequestOfferLocationLabel(data.location_label, null)}
          />
        ) : null}

        <RequestTagsLine slugs={data.tag_slugs} />

        {data.status === 'disputed' ? (
          <RequestCallout tone="danger" title="Issue reported">
            <p className="text-sm text-muted">Active support is reviewing the issue.</p>
          </RequestCallout>
        ) : null}

        {data.status === 'completed' && !data.is_rated ? (
          <Button label="Rate them" size="lg" onClick={() => router.push(`/rate/${id}`)} />
        ) : null}

        {data.status === 'completed' && data.is_rated && acceptedProvider ? (
          <RequestPersonCard
            avatarPath={acceptedProvider.avatar_path}
            name={acceptedProvider.display_name}
            ratingAverage={acceptedProvider.rating_average}
            ratingCount={acceptedProvider.rating_count}
            completionPercent={acceptedProvider.completion_percent}
            onPress={() =>
              setProfilePreview({
                userId: acceptedProvider.responder_id,
                displayName: acceptedProvider.display_name,
                avatarPath: acceptedProvider.avatar_path,
                bio: acceptedProvider.bio,
                ratingAverage: acceptedProvider.rating_average,
                ratingCount: acceptedProvider.rating_count,
                completionPercent: acceptedProvider.completion_percent,
                identityVerified: Boolean(acceptedProvider.identity_verified),
              })
            }
          />
        ) : null}

        {data.status === 'completed' ? (
          <RequestCompletionCard
            completedAtLabel={
              data.completed_at
                ? format(new Date(data.completed_at), "EEEE, d MMM 'at' h:mm a")
                : 'Completed'
            }
            ratingStars={data.my_rating_stars}
            ratingComment={data.my_rating_comment}
          />
        ) : null}

        {reuseLabel && (data.status === 'completed' || isExpiredRequest) ? (
          <Button
            label={reuseLabel}
            size="lg"
            variant={data.status === 'completed' ? 'secondary' : 'primary'}
            onClick={() => router.push(`/request/new?from=${id}`)}
          />
        ) : null}

        {data.status === 'completed' || data.status === 'cancelled' || isExpiredRequest ? (
          <button
            type="button"
            className="py-2 text-center text-base font-semibold text-danger"
            onClick={() => setReportIssueOpen(true)}
          >
            Report an issue
          </button>
        ) : null}

        {isAwaitingReview ? (
          <RequestCallout tone="warning" title="Awaiting review">
            <p className="text-base text-muted">
              The response window ended. Review responses below, extend for more responses, or close
              the request.
            </p>
          </RequestCallout>
        ) : null}

        {isExpiredRequest ? (
          <RequestCallout tone="warning" title="Expired">
            <p className="text-base text-muted">
              Nobody was connected in time. Send a new one when you are ready.
            </p>
          </RequestCallout>
        ) : null}

        {isAwaitingReview ? (
          <div className="flex flex-row gap-3">
            <Button
              label="Close request"
              variant="secondary"
              className="flex-1"
              size="lg"
              onClick={confirmExpireRequest}
              loading={ownerExpireRequest.isPending}
            />
            <Button
              label="Extend"
              className="flex-1"
              size="lg"
              onClick={openExtendDeadline}
              loading={extendRequest.isPending}
            />
          </div>
        ) : null}

        {responseSections.hasActiveEngagement && acceptedProvider ? (
          <div className="flex flex-col gap-4">
            <Button
              label="Open engagement"
              size="lg"
              corner="2xl"
              onClick={() => router.push(`/engagement/${id}`)}
            />
            {renderResponseCard(acceptedProvider, {
              allowSelection: false,
              statusLabel: 'Active helper',
              statusTone: 'active',
            })}
          </div>
        ) : null}

        {showResponsePanels ? (
          <div className="flex flex-col gap-6">
            {isOpen || isAwaitingReview ? (
              <div className="flex flex-col gap-4">
                <p className="text-lg font-bold text-ink">
                  {pending.length === 1 ? '1 Response' : `${pending.length} Responses`}
                </p>

                {responses.isPending && !responses.data ? (
                  <LoadingState label="Loading responses" />
                ) : null}

                {responses.isSuccess &&
                pending.length === 0 &&
                !responseSections.hasActiveEngagement ? (
                  <p className="text-base text-muted">
                    Your request is visible to people nearby. They see approximate distance, not your
                    exact location.
                  </p>
                ) : null}

                {acceptResponse.isError &&
                acceptResponse.error &&
                !isInsufficientWalletBalanceError(acceptResponse.error) ? (
                  <InlineError error={acceptResponse.error} />
                ) : null}

                {pending.map((response) => renderResponseCard(response, { allowSelection: true }))}

                {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
                {extendRequest.isError ? <InlineError error={extendRequest.error} /> : null}
                {ownerExpireRequest.isError ? <InlineError error={ownerExpireRequest.error} /> : null}
              </div>
            ) : null}

            {responseSections.referencePending.length > 0 ? (
              <div className="flex flex-col gap-4">
                <p className="text-lg font-bold text-ink">Other offers</p>
                <p className="text-base text-muted">
                  These helpers responded earlier. You can choose one if your engagement ends.
                </p>
                {responseSections.referencePending.map((response) =>
                  renderResponseCard(response, {
                    allowSelection: false,
                    statusLabel: 'Saved offer',
                    statusTone: 'info',
                  }),
                )}
              </div>
            ) : null}

            {responseSections.withdrawn.length > 0 ? (
              <div className="flex flex-col gap-4">
                <p className="text-lg font-bold text-ink">Withdrawn offers</p>
                {responseSections.withdrawn.map((response) => {
                  const statusBadge = responseStatusBadge('withdrawn');
                  return renderResponseCard(response, {
                    allowSelection: false,
                    statusLabel: statusBadge.label,
                    statusTone: statusBadge.tone,
                  });
                })}
              </div>
            ) : null}

            {responseSections.declined.length > 0 ? (
              <div className="flex flex-col gap-4">
                <p className="text-lg font-bold text-ink">Declined offers</p>
                {responseSections.declined.map((response) => {
                  const statusBadge = responseStatusBadge('declined');
                  return renderResponseCard(response, {
                    allowSelection: false,
                    statusLabel: statusBadge.label,
                    statusTone: statusBadge.tone,
                  });
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <ExtendResponseDeadlineSheet
        open={extendSheetOpen}
        onClose={() => setExtendSheetOpen(false)}
        deadlineAt={extendDeadlineAt}
        onDeadlineAtChange={setExtendDeadlineAt}
        onExtend={submitExtendDeadline}
        extendLoading={extendRequest.isPending}
      />

      <ReportIssueModal
        open={reportIssueOpen}
        issues={REQUEST_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => {
          setReportIssueOpen(false);
          showAppToast('Thanks — we received your report');
        }}
      />

      <ResponderProfileSheet
        open={profilePreview != null}
        onClose={dismissProfile}
        displayName={profilePreview?.displayName ?? null}
        avatarPath={profilePreview?.avatarPath ?? null}
        bio={profilePreview?.bio}
        ratingAverage={profilePreview?.ratingAverage ?? null}
        ratingCount={profilePreview?.ratingCount ?? null}
        completionPercent={profilePreview?.completionPercent}
        responseActions={profileSheetActions}
      />
    </Screen>
  );
}
