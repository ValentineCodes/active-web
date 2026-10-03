import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
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
import { useAttendance, isAttendingAnotherRequest } from '@/features/attendance/api';
import { hasProfilePhotoReady, useProfile } from '@/features/profile/api';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  useMyResponses,
  useRequestForResponse,
  useRespondToRequest,
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
  const attendance = useAttendance();
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
    isFetchingMatch,
    isPending,
    isError,
    error,
    refetch,
  } = useRequestForResponse(id, position);

  const attendingElsewhere = isAttendingAnotherRequest(attendance.data, id);

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
  const initialYourOffer = existingResponse?.quotedAmount ?? requesterOffer ?? 0;
  const initialMessage = existingResponse?.message ?? '';

  const beginFlow = useCallback(() => {
    setNeedsPhotoStep(!hasProfilePhotoReady(profile.data));
    setFlowStep(0);
    setFlowKey((current) => current + 1);
    setInFlow(true);
  }, [profile.data]);

  useEffect(() => {
    if (!autoStartPending.current || isPending || !request) return;
    autoStartPending.current = false;
    beginFlow();
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

  if (!locationChecked || isPending || profile.isPending || myResponses.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <LoadingState label="Opening this request" />
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

  if (isError || profile.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <RequestFlowHeader title="Request" onBack={() => router.back()} />
        <ErrorState error={error ?? profile.error} onRetry={() => refetch()} />
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
          message="It was answered, withdrawn, or is no longer open near you."
          action={{ label: 'Back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

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
            initialYourOffer={initialYourOffer}
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
          onDismiss={() => {
            pendingSubmitRef.current = null;
            setLocationModalError(null);
          }}
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

  return (
    <Screen edges={['top', 'bottom']}>
      <RequestFlowHeader title="Request" onBack={() => router.back()} />

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <RequestHelpSummary
          request={request}
          existingResponse={Boolean(existingResponse)}
          onRequesterPress={() => profileSheetRef.current?.present()}
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
        ) : null}

        {attendingElsewhere ? (
          <RequestCallout tone="warning" title="Attending another request">
            <Text className="text-sm text-muted">
              You can still respond to other requests. Nobody can select you while you are attending
              another one.
            </Text>
          </RequestCallout>
        ) : null}

        {isFetchingMatch ? <LoadingState label="Checking this request" /> : null}

        {declinedParticipation ? null : existingResponse ? (
          <RequestCallout tone="warning" title="Response awaiting acceptance">
            <Text className="text-sm text-muted">
              You can keep responding to other requests. You only commit when the requester accepts.
            </Text>
          </RequestCallout>
        ) : (
          <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
            <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
            <Text className="flex-1 text-sm text-muted">
              They see your name, rating, and roughly how close you are. Exact location and phone
              are shared only if you are selected.
            </Text>
          </View>
        )}

        {respond.isError ? <InlineError error={respond.error} /> : null}
        {withdrawResponse.isError ? <InlineError error={withdrawResponse.error} /> : null}

        {declinedParticipation ? null : existingResponse ? (
          <Button
            label="Cancel response"
            variant="danger"
            size="lg"
            loading={withdrawResponse.isPending}
            onPress={confirmWithdraw}
          />
        ) : (
          <Button label="Respond to request" variant="active" size="lg" onPress={beginFlow} />
        )}

        {declinedParticipation ? null : existingResponse ? (
          <Button label="Update response" variant="secondary" size="lg" onPress={beginFlow} />
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
