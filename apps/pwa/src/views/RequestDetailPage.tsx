'use client';

import { useRouter } from 'next/navigation';

import { ResponseCard } from '@/components/ResponseCard';
import { FlowScreen } from '@/components/layout/FlowScreen';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { isRequestEditable } from '@/features/requests/edit-eligibility';
import { partitionRequestResponsesForRequester } from '@/features/requests/request-response-sections';
import { isAwaitingReviewRequestView, isExpiredRequestView } from '@/features/requests/reuse';
import {
  useAcceptResponse,
  useDeclineResponse,
  useMyRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import { useOpenPreHandshakeConversation } from '@/features/requests/conversation-api';
import { myRequestActivityBadge } from '@/features/requests/activity-list';
import { formatMoney, formatRequestOfferLocationLabel, formatWhenHome } from '@/lib/format';
import { responseStatusBadge } from '@/features/requests/status';
import { useMyWallet } from '@/features/wallet/api';
import { walletLockAmountMajor, walletLockShortfallMajor, walletTopUpPath } from '@/features/wallet/top-up';
import { isInsufficientWalletBalanceError, toUserMessage } from '@/lib/supabase/errors';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';

export function RequestDetailPage() {
  const router = useRouter();
  const id = useRouteParam('id');
  const request = useMyRequest(id);
  const responses = useRequestResponses(id);
  const accept = useAcceptResponse(id);
  const decline = useDeclineResponse(id);
  const openChat = useOpenPreHandshakeConversation();
  const wallet = useMyWallet();

  const partitioned =
    responses.data && request.data
      ? partitionRequestResponsesForRequester(responses.data, request.data.status, {
          isAwaitingReview: isAwaitingReviewRequestView(
            request.data.status,
            request.data.expires_at,
          ),
          isExpiredRequest: isExpiredRequestView(request.data.status, request.data.expires_at),
        })
      : null;

  if (request.isLoading) {
    return (
      <FlowScreen title="Your request" backTo="/activity">
        <LoadingState />
      </FlowScreen>
    );
  }
  if (request.isError || !request.data) {
    return (
      <FlowScreen title="Your request" backTo="/activity">
        <InlineError message={request.error instanceof Error ? request.error.message : 'Request not found.'} />
      </FlowScreen>
    );
  }

  const row = request.data;
  const editable = isRequestEditable({
    status: row.status,
    expires_at: row.expires_at,
    pending_response_count: row.pending_response_count,
  });
  const statusBadge = myRequestActivityBadge({
    status: row.status,
    expires_at: row.expires_at,
    pending_response_count: row.pending_response_count,
  });

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <RequestFlowHeader title="Your request" onBack={() => router.push('/activity')} />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-8 pt-2">
        <Card tone="surface" className="!p-4">
          <div className="flex flex-row items-start justify-between gap-3">
            <h1 className="flex-1 text-xl font-bold text-ink">{row.title}</h1>
            <Badge label={statusBadge.label} tone={statusBadge.tone} dot={false} />
          </div>
          {row.description ? <p className="text-base leading-6 text-muted">{row.description}</p> : null}
          <p className="text-sm text-subtle">
            {formatWhenHome(row.scheduled_for)} · {formatRequestOfferLocationLabel(row.location_label, null)}
          </p>
          {row.offered_amount != null ? (
            <p className="text-lg font-bold text-active">{formatMoney(row.offered_amount, row.currency)}</p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-2">
          {editable ? (
            <Button label="Edit request" variant="ghost" className="!w-auto self-start" onClick={() => router.push(`/request/new?edit=${id}`)} />
          ) : null}
          <Button label="Open engagement" variant="secondary" onClick={() => router.push(`/engagement/${id}`)} />
        </div>

        <SectionHeader title="Responses" />
        {responses.isLoading ? <LoadingState label="Loading responses…" /> : null}
        {partitioned?.selectablePending.length === 0 && !partitioned?.accepted ? (
          <EmptyState layout="list" icon="notifications-outline" title="No responses yet" message="Helpers can respond from the home feed." />
        ) : null}
        <div className="flex flex-col gap-3">
          {[...(partitioned?.selectablePending ?? []), ...(partitioned?.accepted ? [partitioned.accepted] : [])].map(
            (response) => {
              const badge = responseStatusBadge(response.status);
              return (
                <ResponseCard
                  key={response.response_id}
                  displayName={response.display_name}
                  avatarPath={response.avatar_path}
                  message={response.message}
                  quotedAmount={response.quoted_amount}
                  currency={row.currency}
                  createdAt={response.created_at}
                  statusLabel={badge.label}
                  statusTone={badge.tone}
                  actions={
                    response.status === 'pending' && partitioned?.canAccept ? (
                      <>
                        <Button
                          label="Accept"
                          loading={accept.isPending}
                          onClick={() =>
                            void accept
                              .mutateAsync(response.response_id)
                              .then(() => showAppToast('Helper accepted.'))
                              .catch((e) => {
                                if (isInsufficientWalletBalanceError(e) && wallet.data) {
                                  const lock = walletLockAmountMajor({
                                    offeredAmount: row.offered_amount ?? 0,
                                    quotedAmount: response.quoted_amount,
                                  });
                                  const shortfall = walletLockShortfallMajor(lock, wallet.data.available);
                                  router.push(
                                    walletTopUpPath({
                                      returnTo: `/request/${id}`,
                                      requiredLockMajor: lock,
                                      availableMajor: wallet.data.available,
                                    }),
                                  );
                                  if (shortfall > 0) showAppToast(toUserMessage(e), 'warning');
                                  return;
                                }
                                showAppToast(toUserMessage(e), 'warning');
                              })
                          }
                        />
                        <Button
                          label="Decline"
                          variant="secondary"
                          loading={decline.isPending}
                          onClick={() => void decline.mutateAsync({ responseId: response.response_id, reason: null })}
                        />
                        <Button
                          label="Message before accepting"
                          variant="ghost"
                          onClick={() =>
                            void openChat.mutateAsync(response.response_id).then((conversationId) => {
                              router.push(`/conversation/${conversationId}`);
                            })
                          }
                        />
                      </>
                    ) : undefined
                  }
                />
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
