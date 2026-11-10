import { Link, useNavigate, useParams } from 'react-router-dom';

import { useMyWallet } from '@/features/wallet/api';
import { walletLockAmountMajor, walletLockShortfallMajor, walletTopUpPath } from '@/features/wallet/top-up';
import { isInsufficientWalletBalanceError, toUserMessage } from '@/lib/supabase/errors';

import { Button } from '@/components/ui/Button';
import { EmptyState, InlineError } from '@/components/ui/StateView';
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
import { formatMoney, formatRequestOfferLocationLabel, formatWhenHome } from '@/lib/format';
import { responseStatusBadge } from '@/features/requests/status';
import { showAppToast } from '@/lib/toast';

export function RequestDetailPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
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

  if (request.isLoading) return <p className="text-sm text-subtle">Loading…</p>;
  if (request.isError || !request.data) {
    return (
      <InlineError
        message={request.error instanceof Error ? request.error.message : 'Request not found.'}
      />
    );
  }

  const row = request.data;
  const editable = isRequestEditable({
    status: row.status,
    expires_at: row.expires_at,
    pending_response_count: row.pending_response_count,
  });

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/activity" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Your request</h1>
      </header>

      <section className="rounded-2xl border border-hairline bg-elevated p-4">
        <h2 className="text-xl font-semibold text-ink">{row.title}</h2>
        {row.description ? <p className="mt-2 text-sm text-muted">{row.description}</p> : null}
        <p className="mt-3 text-sm text-subtle">
          {formatWhenHome(row.scheduled_for)} ·{' '}
          {formatRequestOfferLocationLabel(row.location_label, null)}
        </p>
        {row.offered_amount != null ? (
          <p className="mt-2 text-base font-semibold text-brand">
            {formatMoney(row.offered_amount, row.currency)}
          </p>
        ) : null}
      </section>

      {editable ? (
        <Link to={`/request/new?edit=${id}`} className="text-sm font-semibold text-brand">
          Edit request
        </Link>
      ) : null}

      <Link to={`/engagement/${id}`} className="text-sm font-semibold text-brand">
        Open engagement view
      </Link>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-subtle">Responses</h3>
        {responses.isLoading ? <p className="text-sm text-subtle">Loading responses…</p> : null}
        {partitioned?.selectablePending.length === 0 && !partitioned?.accepted ? (
          <EmptyState title="No responses yet" description="Helpers can respond from the home feed." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {[
            ...(partitioned?.selectablePending ?? []),
            ...(partitioned?.accepted ? [partitioned.accepted] : []),
          ].map((response) => {
            const badge = responseStatusBadge(response.status);
            return (
              <li key={response.response_id} className="rounded-2xl border border-hairline bg-surface p-4">
                <p className="font-semibold text-ink">{response.display_name ?? 'Helper'}</p>
                <p className="text-xs text-subtle">{badge.label}</p>
                {response.message ? <p className="mt-2 text-sm text-muted">{response.message}</p> : null}
                {response.quoted_amount != null ? (
                  <p className="mt-2 text-sm font-semibold text-brand">
                    {formatMoney(response.quoted_amount, row.currency)}
                  </p>
                ) : null}
                {response.status === 'pending' && partitioned?.canAccept ? (
                  <div className="mt-3 flex flex-col gap-2">
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
                              navigate(
                                walletTopUpPath({
                                  returnTo: `/request/${id}`,
                                  requiredLockMajor: lock,
                                  availableMajor: wallet.data.available,
                                }),
                              );
                              if (shortfall > 0) {
                                showAppToast(toUserMessage(e), 'warning');
                              }
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
                      onClick={() =>
                        void decline.mutateAsync({ responseId: response.response_id, reason: null })
                      }
                    />
                    <Button
                      label="Message before accepting"
                      variant="ghost"
                      onClick={() =>
                        void openChat.mutateAsync(response.response_id).then((conversationId) => {
                          navigate(`/conversation/${conversationId}`);
                        })
                      }
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
