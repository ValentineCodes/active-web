'use client';

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { RequestHelpSummary } from '@/components/RequestHelpSummary';
import {
  PersonProfileSheet,
  personProfileFromRespondableRequest,
} from '@/components/profile/PersonProfileSheet';
import { FlowScreen } from '@/components/layout/FlowScreen';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { TextAreaField } from '@/components/ui/TextField';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { ionIcons } from '@/components/ui/ion-icons';
import { MARKET } from '@/config/index';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import {
  canRespondToRequest,
  useRequestForResponse,
  useResponderPreHandshakeConversation,
  useRespondToRequest,
  useWithdrawResponse,
} from '@/features/requests/responses-api';
import { parsePositionParam, readPositionIfPermitted, requestPosition } from '@/lib/geolocation';
import { useRouteParam } from '@/lib/route-param';
import { useColors } from '@/theme/ThemeProvider';
import { showAppToast } from '@/lib/toast';

export function RespondPage() {
  const router = useRouter();
  const colors = useColors();
  const id = useRouteParam('id');
  const search = useSearchParams();
  const seed = useMemo(
    () => parsePositionParam(search.get('lat') ?? undefined, search.get('lng') ?? undefined),
    [search],
  );
  const [position, setPosition] = useState(seed);
  const [inFlow, setInFlow] = useState(false);
  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState('');
  const [requesterProfileOpen, setRequesterProfileOpen] = useState(false);
  const profile = useMyProfile();
  const respond = useRespondToRequest();
  const withdraw = useWithdrawResponse();
  const preHandshakeConversation = useResponderPreHandshakeConversation(id);

  useEffect(() => {
    if (seed) setPosition(seed);
  }, [seed]);

  useEffect(() => {
    if (seed) return;
    let active = true;
    void (async () => {
      const existing = await readPositionIfPermitted();
      if (!active || !existing) return;
      setPosition(existing);
    })();
    return () => {
      active = false;
    };
  }, [seed]);

  const {
    request,
    existingResponse,
    pendingResponseRow,
    declinedParticipation,
    needsLocation,
    browseConfirmedClosed,
    isPending,
    isError,
    error,
    refetch,
  } = useRequestForResponse(id, position);

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

  const beginRespond = async () => {
    if (!hasProfilePhotoReady(profile.data)) {
      showAppToast('Take a live profile photo before responding.', 'warning');
      return;
    }
    if (needsLocation) {
      const pos = await ensureLocation();
      if (!pos) {
        showAppToast('Location is required to respond.', 'warning');
        return;
      }
    }
    setInFlow(true);
  };

  const submit = async () => {
    if (!request) return;
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
    setInFlow(false);
    void refetch();
  };

  if (isPending && !request) {
    return (
      <FlowScreen title="Request" backTo="/home">
        <LoadingState label="Loading request…" />
      </FlowScreen>
    );
  }
  if (isError) {
    return (
      <FlowScreen title="Request" backTo="/home">
        <InlineError message={error instanceof Error ? error.message : 'Could not load this request.'} />
      </FlowScreen>
    );
  }
  if (!request || browseConfirmedClosed) {
    return (
      <FlowScreen title="Request" backTo="/home">
        <EmptyState
          layout="list"
          icon="alert-circle"
          title="This request has moved on"
          message="It was answered, withdrawn, or is no longer open."
          action={{ label: 'Back', onPress: () => router.push('/home') }}
        />
      </FlowScreen>
    );
  }

  const respondAllowed = !needsLocation && canRespondToRequest(request);

  if (inFlow) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        <RequestFlowHeader title="Respond" onBack={() => setInFlow(false)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
          <div className="flex flex-col gap-4">
          <TextAreaField label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Counteroffer ({MARKET.currencySymbol}, optional)</p>
            <MoneyAmountInput
              accessibilityLabel="Counteroffer amount"
              value={quote}
              onChangeText={setQuote}
            />
          </div>
          <Button label="Send response" loading={respond.isPending} onClick={() => void submit()} corner="2xl" size="lg" />
          {respond.isError ? (
            <InlineError message={respond.error instanceof Error ? respond.error.message : 'Could not send response.'} />
          ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <RequestFlowHeader title="Request" onBack={() => router.push('/home')} />
      <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-12">
        <div className="flex flex-col gap-6">
        <RequestHelpSummary
          request={request}
          existingResponse={Boolean(existingResponse)}
          onRequesterPress={() => setRequesterProfileOpen(true)}
          onRequesterDiscussPress={
            existingResponse && preHandshakeConversation.data
              ? () => router.push(`/conversation/${preHandshakeConversation.data}`)
              : undefined
          }
          requesterDiscussLoading={preHandshakeConversation.isPending}
        />

        {declinedParticipation ? (
          <RequestCallout
            tone="danger"
            title={
              declinedParticipation.requestStillOpen
                ? 'You were rejected for this task'
                : "You weren't selected for this task"
            }
          >
            <p className="text-sm leading-5 text-muted">
              {declinedParticipation.declineReason ??
                (declinedParticipation.requestStillOpen
                  ? 'The requester decided not to move forward with your offer.'
                  : 'Someone else was chosen for this request.')}
            </p>
          </RequestCallout>
        ) : !respondAllowed && !existingResponse && !needsLocation ? (
          <RequestCallout tone="warning" title="Too far away to respond">
            <p className="text-sm text-muted">
              You can read this request, but only helpers within the local discovery area can send a response.
            </p>
          </RequestCallout>
        ) : null}

        {declinedParticipation ? null : existingResponse ? (
          <RequestCallout tone="warning" title="Response awaiting acceptance">
            <p className="text-sm text-muted">
              You can respond to other requests anytime. You are only committed to a job after the requester selects
              you for that time.
            </p>
          </RequestCallout>
        ) : respondAllowed || needsLocation ? (
          <div className="flex flex-row items-start gap-3 rounded-2xl bg-surface p-4">
            <IonIcon icon={ionIcons['lock-closed-outline']} size={18} color={colors.muted} />
            <p className="flex-1 text-sm text-muted">
              They see your name, rating, and roughly how close you are. Exact location and phone are shared only if
              you are selected.
            </p>
          </div>
        ) : null}

        {respond.isError ? (
          <InlineError message={respond.error instanceof Error ? respond.error.message : 'Could not send response.'} />
        ) : null}
        {withdraw.isError ? (
          <InlineError
            message={withdraw.error instanceof Error ? withdraw.error.message : 'Could not withdraw response.'}
          />
        ) : null}

        {!declinedParticipation && !existingResponse ? (
          <Button
            label="Respond to request"
            variant="active"
            size="lg"
            corner="2xl"
            onClick={() => void beginRespond()}
            disabled={!needsLocation && !respondAllowed}
          />
        ) : null}

        {pendingResponseRow?.response_status === 'pending' && existingResponse ? (
          <Button
            label="Withdraw response"
            variant="secondary"
            loading={withdraw.isPending}
            onClick={() => void withdraw.mutateAsync(existingResponse.responseId)}
          />
        ) : null}
        </div>
      </div>

      <PersonProfileSheet
        open={requesterProfileOpen}
        profile={personProfileFromRespondableRequest(request)}
        onClose={() => setRequesterProfileOpen(false)}
      />
    </div>
  );
}
