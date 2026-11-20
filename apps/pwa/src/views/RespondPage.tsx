'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { RequestHelpSummary } from '@/components/RequestHelpSummary';
import {
  PersonProfileSheet,
  personProfileFromRespondableRequest,
} from '@/components/profile/PersonProfileSheet';
import { ExistingResponseCard } from '@/components/request-flow/ExistingResponseCard';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { ResponseCreationFlow } from '@/components/request-flow/ResponseCreationFlow';
import { RequestLocationModal } from '@/components/RequestLocationModal';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { ionIcons } from '@/components/ui/ion-icons';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import {
  savedLocationPosition,
  useMySavedLocations,
  type SavedLocation,
} from '@/features/profile/saved-locations-api';
import { isHelperEngagementView } from '@/features/requests/activity-list';
import {
  canRespondToRequest,
  responseWizardInitialOffer,
  useMyResponses,
  useRequestForResponse,
  useResponderPreHandshakeConversation,
  useRespondToRequest,
  useWithdrawResponse,
} from '@/features/requests/responses-api';
import {
  parsePositionParam,
  positionErrorMessage,
  readForegroundPermission,
  readPositionIfPermitted,
  requestPosition,
  type ForegroundPermission,
  type Position,
} from '@/lib/geolocation';
import { conversationHref } from '@/lib/conversation-navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRequestMilestonePlanForRespond,
  useSubmitResponseMilestoneProposal,
} from '@/features/requests/milestone-api';
import type { MilestoneRpcItem } from '@/features/requests/milestones';
import { queryKeys } from '@/lib/query/keys';
import { useRouter, useSearchParams } from '@/lib/navigation';
import { supabase } from '@/lib/supabase/client';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme/ThemeProvider';

type PendingSubmit = {
  message: string | null;
  quotedAmount: number | null;
  proposedDeliveryDurationValue: number;
  proposedDeliveryDurationUnit: import('@/features/requests/delivery-duration').DeliveryDurationUnit;
  milestoneProposal?: MilestoneRpcItem[] | null;
};

type PendingLocationAction =
  | { type: 'begin-flow' }
  | { type: 'submit'; payload: PendingSubmit };

export function RespondPage() {
  const router = useRouter();
  const colors = useColors();
  const id = useRouteParam('id');
  const search = useSearchParams();
  const start = search.get('start');
  const seedPosition = useMemo(
    () => parsePositionParam(search.get('lat') ?? undefined, search.get('lng') ?? undefined),
    [search],
  );

  const myResponses = useMyResponses();
  const profile = useMyProfile();
  const respond = useRespondToRequest();
  const withdrawResponse = useWithdrawResponse();
  const submitMilestoneProposal = useSubmitResponseMilestoneProposal();
  const milestonePlan = useRequestMilestonePlanForRespond(id);
  const queryClient = useQueryClient();
  const preHandshakeConversation = useResponderPreHandshakeConversation(id);
  const savedLocations = useMySavedLocations();

  const [position, setPosition] = useState<Position | null>(() => seedPosition);
  const [locationChecked, setLocationChecked] = useState(() => seedPosition !== null);
  const [inFlow, setInFlow] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [flowKey, setFlowKey] = useState(0);
  const [needsPhotoStep, setNeedsPhotoStep] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationModalLoading, setLocationModalLoading] = useState(false);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const [foregroundPermission, setForegroundPermission] = useState<ForegroundPermission | null>(
    null,
  );
  const [requesterProfileOpen, setRequesterProfileOpen] = useState(false);

  const autoStartPending = useRef(start === '1');
  const pendingLocationRef = useRef<PendingLocationAction | null>(null);

  const {
    request,
    existingResponse,
    declinedParticipation,
    needsLocation,
    isPending,
    isError,
    error,
    refetch,
  } = useRequestForResponse(id, position);

  useEffect(() => {
    if (seedPosition) {
      setPosition(seedPosition);
      setLocationChecked(true);
      return;
    }

    let active = true;
    void (async () => {
      const existing = await readPositionIfPermitted();
      if (!active) return;
      setPosition(existing);
      setLocationChecked(true);
    })();

    return () => {
      active = false;
    };
  }, [seedPosition]);

  const requesterOffer = request?.offered_amount ?? null;
  const initialOfferInput = useMemo(
    () =>
      requesterOffer !== null
        ? responseWizardInitialOffer(existingResponse?.quotedAmount, requesterOffer)
        : '',
    [existingResponse?.quotedAmount, requesterOffer],
  );
  const initialMessage = existingResponse?.message ?? '';

  const requesterMilestones = milestonePlan.data?.requesterMilestones ?? [];
  const myProposedMilestones = milestonePlan.data?.myProposedMilestones ?? [];

  const responseProposedMilestoneTotalMajor = useMemo(() => {
    if (myProposedMilestones.length < 2) return undefined;
    const quoted = existingResponse?.quotedAmount;
    if (quoted != null && quoted > 0) return quoted;
    return request?.offered_amount ?? undefined;
  }, [myProposedMilestones.length, existingResponse?.quotedAmount, request?.offered_amount]);

  const beginFlow = useCallback(() => {
    respond.reset();
    setNeedsPhotoStep(!hasProfilePhotoReady(profile.data));
    setFlowStep(0);
    setFlowKey((current) => current + 1);
    setInFlow(true);
  }, [profile.data, respond]);

  const openLocationSheet = useCallback((pending: PendingLocationAction) => {
    void (async () => {
      const permission = await readForegroundPermission();
      setForegroundPermission(permission);
      if (permission === 'denied') {
        showAppToast(
          'Location access is off. Turn it on in browser settings to respond to this request.',
          'warning',
        );
      }
      pendingLocationRef.current = pending;
      setLocationModalError(null);
      setLocationModalOpen(true);
    })();
  }, []);

  const tryBeginFlow = useCallback(() => {
    if (position || existingResponse) {
      beginFlow();
      return;
    }
    openLocationSheet({ type: 'begin-flow' });
  }, [position, existingResponse, beginFlow, openLocationSheet]);

  useEffect(() => {
    if (!autoStartPending.current || isPending || !request) return;
    if (existingResponse) {
      autoStartPending.current = false;
      return;
    }
    if (!canRespondToRequest(request) && !needsLocation) {
      autoStartPending.current = false;
      return;
    }
    autoStartPending.current = false;
    const handle = window.setTimeout(() => tryBeginFlow(), 0);
    return () => window.clearTimeout(handle);
  }, [isPending, request, needsLocation, existingResponse, tryBeginFlow]);

  const exitFlow = () => {
    setInFlow(false);
    setFlowStep(0);
  };

  const activeAsHelper = myResponses.data?.find(
    (row) =>
      row.request_id === id &&
      isHelperEngagementView({
        responseStatus: row.response_status,
        requestStatus: row.request_status,
      }),
  );

  const mutateResponse = (postPosition: Position | null, payload: PendingSubmit) => {
    if (!request) return;

    respond.mutate(
      {
        requestId: request.request_id,
        message: payload.message,
        quotedAmount: payload.quotedAmount,
        position: postPosition,
        proposedDeliveryDurationValue: payload.proposedDeliveryDurationValue,
        proposedDeliveryDurationUnit: payload.proposedDeliveryDurationUnit,
      },
      {
        onError: (error) => {
          showAppToast(error.message, 'danger');
        },
        onSuccess: () => {
          void (async () => {
            if (payload.milestoneProposal && payload.milestoneProposal.length >= 2) {
              await queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
              const { data, error } = await supabase.rpc('my_responses');
              if (error) throw error;
              const row = data?.find(
                (entry: { request_id: string; response_status: string; response_id?: string }) =>
                  entry.request_id === request.request_id && entry.response_status === 'pending',
              );
              if (row?.response_id) {
                await submitMilestoneProposal.mutateAsync({
                  responseId: row.response_id,
                  requestId: request.request_id,
                  items: payload.milestoneProposal,
                });
              }
            }
            await queryClient.invalidateQueries({
              queryKey: queryKeys.requestMilestonePlan(request.request_id),
            });
            showAppToast(existingResponse ? 'Response updated' : 'Response sent');
            exitFlow();
          })().catch((err: unknown) => {
            showAppToast(
              err instanceof Error ? err.message : 'Could not save milestone proposal.',
              'warning',
            );
          });
        },
      },
    );
  };

  const completeAfterLocation = (nextPosition: Position) => {
    setPosition(nextPosition);
    setLocationModalLoading(false);
    setLocationModalOpen(false);
    const pending = pendingLocationRef.current;
    pendingLocationRef.current = null;
    if (!pending) return;
    if (pending.type === 'begin-flow') beginFlow();
    else mutateResponse(nextPosition, pending.payload);
  };

  const submitResponse = (payload: PendingSubmit) => {
    if (position) {
      mutateResponse(position, payload);
      return;
    }
    if (existingResponse) {
      mutateResponse(null, payload);
      return;
    }
    openLocationSheet({ type: 'submit', payload });
  };

  const selectSavedPlaceForRespond = (place: SavedLocation) => {
    if (locationModalLoading) return;
    setLocationModalLoading(true);
    setLocationModalError(null);
    completeAfterLocation(savedLocationPosition(place));
  };

  const shareLocationForResponse = () => {
    if (locationModalLoading) return;

    setLocationModalLoading(true);
    setLocationModalError(null);

    const positionRequest = requestPosition({ fresh: true });

    void (async () => {
      try {
        const result = await positionRequest;
        setForegroundPermission(await readForegroundPermission());

        if (!result.ok) {
          setLocationModalError(
            positionErrorMessage(result, 'Turn it on in browser settings to send your response.'),
          );
          return;
        }

        completeAfterLocation(result.position);
      } catch {
        setLocationModalError('Could not get your location. Try again.');
      } finally {
        setLocationModalLoading(false);
      }
    })();
  };

  const dismissLocationModal = () => {
    if (locationModalLoading) return;
    pendingLocationRef.current = null;
    setLocationModalError(null);
    setLocationModalOpen(false);
  };

  const confirmWithdraw = () => {
    if (!existingResponse) return;
    const confirmed = window.confirm(
      'Cancel response?\n\nYou can respond again later if the request is still open.',
    );
    if (!confirmed) return;

    withdrawResponse.mutate(existingResponse.responseId, {
      onSuccess: () => {
        showAppToast('Response cancelled');
        router.back();
      },
    });
  };

  const locationModal = (
    <RequestLocationModal
      open={locationModalOpen}
      onClose={dismissLocationModal}
      nested={false}
      title="Location needed to respond"
      body="We use your location once to confirm this request is near you. Nobody sees your exact address — only roughly how close you are — until you are selected."
      loading={locationModalLoading}
      errorMessage={locationModalError}
      showSaveForFuture={false}
      locationPermissionDenied={foregroundPermission === 'denied'}
      savedPlaces={savedLocations.data ?? []}
      savedPlacesLoading={savedLocations.isPending}
      onSelectSavedPlace={selectSavedPlaceForRespond}
      onShareLocation={shareLocationForResponse}
    />
  );

  if (!locationChecked || (isPending && !request)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <LoadingState label="Loading request…" />
      </div>
    );
  }

  if (activeAsHelper) {
    return <Navigate to={`/engagement/${id}`} replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <InlineError error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <EmptyState
          layout="list"
          icon="alert-circle"
          title="Couldn't load this request"
          message="Check your connection and try again."
          action={{ label: 'Retry', onPress: () => void refetch() }}
        />
      </div>
    );
  }

  const respondAllowed = canRespondToRequest(request);

  if (inFlow) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col bg-canvas">
          <ResponseCreationFlow
            key={flowKey}
            step={flowStep}
            onStepChange={setFlowStep}
            onExit={exitFlow}
            request={request}
            initialYourOffer={initialOfferInput}
            initialMessage={initialMessage}
            initialProposedDeliveryDurationValue={existingResponse?.proposedDeliveryDurationValue}
            initialProposedDeliveryDurationUnit={existingResponse?.proposedDeliveryDurationUnit}
            needsPhotoStep={needsPhotoStep}
            isUpdate={Boolean(existingResponse)}
            submitting={respond.isPending}
            submitError={respond.error instanceof Error ? respond.error : null}
            onSubmit={submitResponse}
            milestoneMode={milestonePlan.data?.paymentStructure === 'milestone'}
            requesterMilestones={milestonePlan.data?.requesterMilestones ?? []}
          />
        </div>
        {locationModal}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <RequestFlowHeader title="Request" onBack={() => router.back()} />

      <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-12">
        <div className="flex flex-col gap-6">
          <RequestHelpSummary
            request={request}
            paymentStructure={
              existingResponse
                ? 'single'
                : (milestonePlan.data?.paymentStructure ?? 'single')
            }
            milestoneItems={existingResponse ? [] : requesterMilestones}
            existingResponse={Boolean(existingResponse)}
            onRequesterPress={() => setRequesterProfileOpen(true)}
            onRequesterDiscussPress={
              existingResponse && preHandshakeConversation.data
                ? () =>
                    router.push(
                      conversationHref(preHandshakeConversation.data!, `/request/${id}`),
                    )
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
          ) : !respondAllowed && !existingResponse ? (
            <RequestCallout tone="warning" title="Too far away to respond">
              <p className="text-sm text-muted">
                You can read this request, but only helpers within the local discovery area can send a
                response.
              </p>
            </RequestCallout>
          ) : null}

          {declinedParticipation ? null : existingResponse ? (
            <ExistingResponseCard
              currency={request.currency}
              quotedAmount={existingResponse.quotedAmount}
              requesterOffer={requesterOffer}
              message={existingResponse.message}
              proposedMilestones={
                myProposedMilestones.length >= 2 ? myProposedMilestones : undefined
              }
              proposedMilestoneTotalMajor={responseProposedMilestoneTotalMajor}
              proposedDeliveryDurationValue={existingResponse.proposedDeliveryDurationValue}
              proposedDeliveryDurationUnit={existingResponse.proposedDeliveryDurationUnit}
              proposedDeliveryAt={existingResponse.proposedDeliveryAt}
              proposedDeliveryTimezone={existingResponse.proposedDeliveryTimezone}
              onEdit={tryBeginFlow}
              onCancel={confirmWithdraw}
              cancelLoading={withdrawResponse.isPending}
            />
          ) : respondAllowed || needsLocation ? (
            <div className="flex flex-row items-start gap-3 rounded-2xl bg-surface p-4">
              <IonIcon icon={ionIcons['lock-closed-outline']} size={18} color={colors.muted} />
              <p className="flex-1 text-sm text-muted">
                They see your name, rating, and roughly how close you are. Exact location and phone are
                shared only if you are selected.
              </p>
            </div>
          ) : null}

          {respond.isError ? <InlineError error={respond.error} /> : null}
          {withdrawResponse.isError ? <InlineError error={withdrawResponse.error} /> : null}

          {!declinedParticipation && !existingResponse && (respondAllowed || needsLocation) ? (
            <Button
              label="Respond to request"
              variant="active"
              size="lg"
              corner="2xl"
              onClick={tryBeginFlow}
            />
          ) : null}
        </div>
      </div>

      <PersonProfileSheet
        open={requesterProfileOpen}
        profile={personProfileFromRespondableRequest(request)}
        onClose={() => setRequesterProfileOpen(false)}
      />
      {locationModal}
    </div>
  );
}