'use client';

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { TextAreaField } from '@/components/ui/TextField';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import {
  canRespondToRequest,
  useRequestForResponse,
  useRespondToRequest,
  useWithdrawResponse,
} from '@/features/requests/responses-api';
import { parsePositionParam, readPositionIfPermitted, requestPosition } from '@/lib/geolocation';
import { formatMoney, formatRequestOfferLocationLabel, formatWhenHome } from '@/lib/format';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';

export function RespondPage() {
  const router = useRouter();
  const id = useRouteParam('id');
  const search = useSearchParams();
  const seed = useMemo(
    () => parsePositionParam(search.get('lat') ?? undefined, search.get('lng') ?? undefined),
    [search],
  );
  const [position, setPosition] = useState(seed);
  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState('');
  const profile = useMyProfile();
  const respond = useRespondToRequest();
  const withdraw = useWithdrawResponse();

  const { request, existingResponse, pendingResponseRow, needsLocation, isPending, isError, error, refetch } =
    useRequestForResponse(id, position);

  const ensureLocation = async () => {
    if (position) return position;
    const granted = await readPositionIfPermitted();
    if (granted) {
      setPosition(granted);
      return granted;
    }
    const result = await requestPosition({ fresh: true });
    if (result.ok) {
      setPosition(result.position);
      return result.position;
    }
    return null;
  };

  const submit = async () => {
    if (!hasProfilePhotoReady(profile.data)) {
      showAppToast('Take a live profile photo before responding.', 'warning');
      return;
    }
    const pos = await ensureLocation();
    if (!pos) {
      showAppToast('Location is required to respond.', 'warning');
      return;
    }
    const quoted = quote.trim() ? Number(quote) : null;
    await respond.mutateAsync({
      requestId: id,
      message: message.trim() || null,
      quotedAmount: quoted,
      position: pos,
    });
    showAppToast('Response sent.');
    void refetch();
  };

  if (isPending) {
    return (
      <FlowScreen title="Respond" backTo="/home">
        <LoadingState label="Loading request…" />
      </FlowScreen>
    );
  }
  if (isError) {
    return (
      <FlowScreen title="Respond" backTo="/home">
        <InlineError message={error instanceof Error ? error.message : 'Could not load this request.'} />
      </FlowScreen>
    );
  }
  if (!request) {
    return (
      <FlowScreen title="Respond" backTo="/home">
        <InlineError message="This request is no longer open." />
      </FlowScreen>
    );
  }

  const canRespond = canRespondToRequest(request);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <RequestFlowHeader title="Respond" onBack={() => router.push('/home')} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-8 pt-2">
        <Card tone="surface" className="!p-4">
          <h2 className="text-lg font-bold text-ink">{request.title}</h2>
          {request.description ? <p className="text-base leading-6 text-muted">{request.description}</p> : null}
          <p className="text-sm text-subtle">
            {formatWhenHome(request.scheduled_for)} ·{' '}
            {formatRequestOfferLocationLabel(request.location_label, request.distance_m)}
          </p>
          {request.offered_amount != null ? (
            <p className="text-lg font-bold text-active">{formatMoney(request.offered_amount, request.currency)}</p>
          ) : null}
        </Card>

        {needsLocation ? <Button label="Share location to respond" onClick={() => void ensureLocation()} /> : null}

        {existingResponse ? (
          <Card tone="surface" className="!p-4">
            <p className="text-sm text-muted">
              You already responded
              {pendingResponseRow ? ` (${pendingResponseRow.response_status})` : ''}.
            </p>
            {pendingResponseRow?.response_status === 'pending' ? (
              <Button
                label="Withdraw response"
                variant="secondary"
                className="mt-3"
                loading={withdraw.isPending}
                onClick={() => void withdraw.mutateAsync(existingResponse.responseId)}
              />
            ) : null}
          </Card>
        ) : canRespond ? (
          <>
            <TextAreaField label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Counteroffer ({MARKET.currencySymbol}, optional)</p>
              <MoneyAmountInput
                accessibilityLabel="Counteroffer amount"
                value={quote}
                onChangeText={setQuote}
              />
            </div>
            <Button label="Send response" loading={respond.isPending} onClick={() => void submit()} />
          </>
        ) : (
          <p className="text-sm text-muted">This request is not accepting responses.</p>
        )}
      </div>
    </div>
  );
}
