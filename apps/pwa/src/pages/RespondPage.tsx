import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import {
  canRespondToRequest,
  useRequestForResponse,
  useRespondToRequest,
  useWithdrawResponse,
} from '@/features/requests/responses-api';
import { parsePositionParam, readPositionIfPermitted, requestPosition } from '@/lib/geolocation';
import { formatMoney, formatRequestOfferLocationLabel, formatWhenHome } from '@/lib/format';
import { MARKET } from '@/config/index';
import { showAppToast } from '@/lib/toast';

export function RespondPage() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
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

  if (isPending) return <p className="text-sm text-subtle">Loading request…</p>;
  if (isError) {
    return (
      <InlineError message={error instanceof Error ? error.message : 'Could not load this request.'} />
    );
  }
  if (!request) {
    return <InlineError message="This request is no longer open." />;
  }

  const canRespond = canRespondToRequest(request);

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/home" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Respond</h1>
      </header>

      <section className="rounded-2xl border border-hairline bg-elevated p-4">
        <h2 className="text-lg font-semibold text-ink">{request.title}</h2>
        {request.description ? <p className="mt-2 text-sm text-muted">{request.description}</p> : null}
        <p className="mt-2 text-xs text-subtle">
          {formatWhenHome(request.scheduled_for)} ·{' '}
          {formatRequestOfferLocationLabel(request.location_label, request.distance_m)}
        </p>
        {request.offered_amount != null ? (
          <p className="mt-2 text-base font-semibold text-brand">
            {formatMoney(request.offered_amount, request.currency)}
          </p>
        ) : null}
      </section>

      {needsLocation ? (
        <Button label="Share location to respond" onClick={() => void ensureLocation()} />
      ) : null}

      {existingResponse ? (
        <section className="rounded-2xl bg-surface p-4 text-sm text-muted">
          <p>
            You already responded
            {pendingResponseRow ? ` (${pendingResponseRow.response_status})` : ''}.
          </p>
          {pendingResponseRow?.response_status === 'pending' ? (
            <div className="mt-3">
              <Button
                label="Withdraw response"
                variant="secondary"
                loading={withdraw.isPending}
                onClick={() => void withdraw.mutateAsync(existingResponse.responseId)}
              />
            </div>
          ) : null}
        </section>
      ) : canRespond ? (
        <>
          <TextAreaField label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <TextField
            label={`Counteroffer (${MARKET.currencySymbol}, optional)`}
            inputMode="numeric"
            value={quote}
            onChange={(e) => setQuote(e.target.value.replace(/[^\d]/g, ''))}
          />
          <Button label="Send response" loading={respond.isPending} onClick={() => void submit()} />
        </>
      ) : (
        <p className="text-sm text-muted">This request is not accepting responses.</p>
      )}
    </div>
  );
}
