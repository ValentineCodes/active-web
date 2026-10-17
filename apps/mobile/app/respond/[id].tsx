import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestHelpSummary } from '@/components/RequestHelpSummary';
import {
  RequestLocationModal,
  type RequestLocationSheetHandle,
} from '@/components/RequestLocationModal';
import { ResponseCreationFlow } from '@/components/ResponseCreationFlow';
import { hasProfilePhotoReady, useProfile } from '@/features/profile/api';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import {
  canRespondToRequest,
  responseWizardInitialOffer,
  useMyResponses,
  useRequestForResponse,
  useRespondToRequest,
  useResponderPreHandshakeConversation,
  useWithdrawResponse,
} from '@/features/requests/responses-api';
import {
  parsePositionParam,
  positionErrorMessage,
  readPositionIfPermitted,
  requestPosition,
  type Position,
} from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

type PendingSubmit = {
  message: string | null;
  quotedAmount: number | null;
};

export default function RespondScreen() {
  const colors = useColors();
  const { id, lat, lng, start } = useLocalSearchParams<{
    id: string;
    lat?: string;
    lng?: string;
    start?: string;
  }>();
  const myResponses = useMyResponses();
  const profile = useProfile();
  const respond = useRespondToRequest();
  const withdrawResponse = useWithdrawResponse();

  const seedPosition = useMemo(() => parsePositionParam(lat, lng), [lat, lng]);
  const [position, setPosition] = useState<Position | null>(() => seedPosition);
  const [locationChecked, setLocationChecked] = useState(() => seedPosition !== null);
  const [inFlow, setInFlow] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [flowKey, setFlowKey] = useState(0);
  const [needsPhotoStep, setNeedsPhotoStep] = useState(false);
  const [locationModalLoading, setLocationModalLoading] = useState(false);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const autoStartPending = useRef(start === '1');
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const locationSheetRef = useRef<RequestLocationSheetHandle>(null);
  const pendingSubmitRef = useRef<PendingSubmit | null>(null);

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
  useQueryErrorToast({ isError, isFetching: isPending, error: isError ? error : undefined });
  useQueryErrorToast(profile, { enabled: profile.isError && !profile.data });
  const preHandshakeConversation = useResponderPreHandshakeConversation(id);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([refetch(), profile.refetch(), preHandshakeConversation.refetch()]);
    } finally {
      setPullRefreshing(false);
    }
  }, [preHandshakeConversation.refetch, profile.refetch, refetch]);

  useFocusEffect(
    useCallback(() => {
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
    }, [seedPosition]),
  );

  const requesterOffer = request?.offered_amount ?? null;
  const initialOfferInput = useMemo(
    () =>
      requesterOffer !== null
        ? responseWizardInitialOffer(existingResponse?.quotedAmount, requesterOffer)
        : '',
    [existingResponse?.quotedAmount, requesterOffer],
  );
  const initialMessage = existingResponse?.message ?? '';

  const beginFlow = useCallback(() => {
    respond.reset();
    setNeedsPhotoStep(!hasProfilePhotoReady(profile.data));
    setFlowStep(0);
    setFlowKey((current) => current + 1);
    setInFlow(true);
  }, [profile.data, respond.reset]);

  useEffect(() => {
    if (!autoStartPending.current || isPending || !request) return;
    if (!canRespondToRequest(request)) {
      autoStartPending.current = false;
      return;
    }
    autoStartPending.current = false;
    const handle = setTimeout(() => beginFlow(), 0);
    return () => clearTimeout(handle);
  }, [isPending, request, beginFlow]);

  const exitFlow = () => {
    setInFlow(false);
    setFlowStep(0);
  };

  const activeAsHelper = myResponses.data?.find(
    (row) =>
      row.request_id === id &&
      row.response_status === 'accepted' &&
      ['accepted', 'in_progress', 'completion_pending'].includes(row.request_status),
  );

  const mutateResponse = (postPosition: Position, payload: PendingSubmit) => {
    if (!request) return;

    respond.mutate(
      {
        requestId: request.request_id,
        message: payload.message,
        quotedAmount: payload.quotedAmount,
        position: postPosition,
      },
      {
        onSuccess: () => {
          void syncPushToken({ mode: 'contextual' });
          showAppToast(existingResponse ? 'Response updated' : 'Response sent');
          router.back();
        },
      },
    );
  };

  const submitResponse = (payload: PendingSubmit) => {
    if (position) {
      mutateResponse(position, payload);
      return;
    }

    pendingSubmitRef.current = payload;
    setLocationModalError(null);
    setTimeout(() => {
      locationSheetRef.current?.present();
    }, 0);
  };

  const shareLocationForResponse = async () => {
    setLocationModalLoading(true);
    setLocationModalError(null);

    const result = await requestPosition();
    if (!result.ok) {
      setLocationModalError(
        positionErrorMessage(result, 'Turn it on in Settings to send your response.'),
      );
      setLocationModalLoading(false);
      return;
    }

    setPosition(result.position);
    setLocationModalLoading(false);
    locationSheetRef.current?.dismiss();

    const payload = pendingSubmitRef.current;
    pendingSubmitRef.current = null;
    if (payload) mutateResponse(result.position, payload);
  };

  if (!locationChecked || (isPending && !request)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow"
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={() => void onPullRefresh()}
            />
          }
        />
      </Screen>
    );
  }

  if (activeAsHelper) {
    return <Redirect href={`/engagement/${id}`} />;
  }

  if (needsLocation) {
    return (
      <Screen edges={['top', 'bottom']}>
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <EmptyState
          icon="location-outline"
          title="Location is needed"
          message="We use your location once to see if this request is relevant near you. Exact addresses stay private."
          action={{
            label: 'Use my location',
            onPress: () => {
              void requestPosition().then((result) => {
                if (result.ok) setPosition(result.position);
              });
            },
          }}
        />
      </Screen>
    );
  }

  if (!request || requesterOffer === null) {
    return (
      <Screen edges={['top', 'bottom']}>
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <EmptyState
          icon="close-circle-outline"
          title="This request has moved on"
          message="It was answered, withdrawn, or is no longer open."
          action={{ label: 'Back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const respondAllowed = canRespondToRequest(request);

  if (inFlow) {
    return (
      <>
        <Screen edges={['top', 'bottom']}>
          <ResponseCreationFlow
            key={flowKey}
            step={flowStep}
            onStepChange={setFlowStep}
            onExit={exitFlow}
            request={request}
            initialYourOffer={initialOfferInput}
            initialMessage={initialMessage}
            needsPhotoStep={needsPhotoStep}
            isUpdate={Boolean(existingResponse)}
            submitting={respond.isPending}
            submitError={respond.error}
            onSubmit={submitResponse}
          />
        </Screen>

        <RequestLocationModal
          ref={locationSheetRef}
          title="Location needed to respond"
          body="We use your location once to confirm this request is near you. Nobody sees your exact address — only roughly how close you are — until you are selected."
          loading={locationModalLoading}
          errorMessage={locationModalError}
          showSaveForFuture={false}
          onDismiss={() => {
            pendingSubmitRef.current = null;
            setLocationModalError(null);
          }}
          onSelectSavedPlace={() => {}}
          onShareLocation={() => void shareLocationForResponse()}
        />
      </>
    );
  }

  const confirmWithdraw = () => {
    if (!existingResponse) return;

    Alert.alert('Cancel response?', 'You can respond again later if the request is still open.', [
      { text: 'Keep response', style: 'cancel' },
      {
        text: 'Cancel response',
        style: 'destructive',
        onPress: () =>
          withdrawResponse.mutate(existingResponse.responseId, {
            onSuccess: () => {
              showAppToast('Response withdrawn');
              router.back();
            },
          }),
      },
    ]);
  };

  const responseMenuActions =
    existingResponse && !declinedParticipation
      ? [
          { label: 'Update response', onPress: beginFlow },
          { label: 'Cancel response', destructive: true, onPress: confirmWithdraw },
        ]
      : undefined;

  return (
    <Screen edges={['top', 'bottom']}>
      <RequestFlowHeader
        title="Request"
        onBack={() => router.back()}
        menuActions={responseMenuActions}
      />

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => void onPullRefresh()}
          />
        }
      >
        <RequestHelpSummary
          request={request}
          existingResponse={Boolean(existingResponse)}
          onRequesterPress={() => profileSheetRef.current?.present()}
          onRequesterDiscussPress={
            existingResponse && preHandshakeConversation.data
              ? () => router.push(`/conversation/${preHandshakeConversation.data}`)
              : undefined
          }
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
            {declinedParticipation.declineReason ? (
              <Text className="text-sm leading-5 text-muted">
                {declinedParticipation.declineReason}
              </Text>
            ) : (
              <Text className="text-sm text-muted">
                {declinedParticipation.requestStillOpen
                  ? 'The requester decided not to move forward with your offer.'
                  : 'Someone else was chosen for this request.'}
              </Text>
            )}
          </RequestCallout>
        ) : !respondAllowed && !existingResponse ? (
          <RequestCallout tone="warning" title="Too far away to respond">
            <Text className="text-sm text-muted">
              You can read this request, but only helpers within the local discovery area can send a
              response.
            </Text>
          </RequestCallout>
        ) : null}

        {declinedParticipation ? null : existingResponse ? (
          <RequestCallout tone="warning" title="Response awaiting acceptance">
            <Text className="text-sm text-muted">
              You can respond to other requests anytime. You are only committed to a job after the
              requester selects you for that time.
            </Text>
          </RequestCallout>
        ) : respondAllowed ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
            <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
            <Text className="flex-1 text-sm text-muted">
              They see your name, rating, and roughly how close you are. Exact location and phone
              are shared only if you are selected.
            </Text>
          </View>
        ) : null}

        {respond.isError ? <InlineError error={respond.error} /> : null}
        {withdrawResponse.isError ? <InlineError error={withdrawResponse.error} /> : null}

        {!declinedParticipation && !existingResponse && respondAllowed ? (
          <Button
            label="Respond to request"
            variant="active"
            size="lg"
            corner="2xl"
            onPress={beginFlow}
          />
        ) : null}

      </ScrollView>

      <PersonProfileBottomSheet
        key={request.requester_id}
        sheetRef={profileSheetRef}
        userId={request.requester_id}
        displayName={request.requester_display_name}
        avatarPath={request.requester_avatar_path}
        bio={request.requester_bio}
        ratingAverage={request.requester_rating_average}
        ratingCount={request.requester_rating_count}
        completionPercent={request.requester_completion_percent}
      />
    </Screen>
  );
}
