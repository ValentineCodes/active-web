import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestHelpSummary } from '@/components/RequestHelpSummary';
import { RespondRequirementsGate } from '@/components/RespondRequirementsGate';
import { ResponseCreationFlow } from '@/components/ResponseCreationFlow';
import { useAttendance, isAttendingAnotherRequest } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import {
  resolveRespondRequirements,
  type RespondRequirementBlocker,
} from '@/features/requests/respond-requirements';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
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
  readPositionIfPermitted,
  requestPosition,
  type Position,
} from '@/lib/location';
import { colors } from '@/theme';

type GateMode = 'off' | 'checking' | 'open';

export default function RespondScreen() {
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
  const [gateMode, setGateMode] = useState<GateMode>('off');
  const [gateBlocker, setGateBlocker] = useState<RespondRequirementBlocker | null>(null);
  const autoStartPending = useRef(start === '1');

  const {
    request,
    existingResponse,
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
    setFlowStep(0);
    setFlowKey((current) => current + 1);
    setInFlow(true);
    setGateMode('off');
    setGateBlocker(null);
  }, []);

  const tryStartResponse = useCallback(async () => {
    setGateMode('checking');
    setGateBlocker(null);

    const result = await resolveRespondRequirements(profile.data);
    if (!result.ok) {
      setGateBlocker(result.blocker);
      setGateMode('open');
      return;
    }

    setPosition(result.position);
    beginFlow();
  }, [profile.data, beginFlow]);

  useEffect(() => {
    if (!autoStartPending.current || isPending || !request) return;
    autoStartPending.current = false;
    void tryStartResponse();
  }, [isPending, request, tryStartResponse]);

  const exitFlow = () => {
    setInFlow(false);
    setFlowStep(0);
  };

  const closeGate = () => {
    setGateMode('off');
    setGateBlocker(null);
  };

  const headerBack = inFlow
    ? () => {
        if (flowStep === 0) exitFlow();
        else setFlowStep(0);
      }
    : gateMode === 'open'
      ? closeGate
      : undefined;

  const headerTitle = gateMode === 'open' ? 'Before you respond' : 'Request';

  const activeAsHelper = myResponses.data?.find(
    (row) =>
      row.request_id === id &&
      row.response_status === 'accepted' &&
      ['accepted', 'in_progress', 'completion_pending'].includes(row.request_status),
  );

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

  const submitResponse = (payload: { message: string | null; quotedAmount: number | null }) => {
    if (!position) return;

    respond.mutate(
      {
        requestId: request.request_id,
        message: payload.message,
        quotedAmount: payload.quotedAmount,
        position,
      },
      {
        onSuccess: () => {
          Alert.alert(
            existingResponse ? 'Response updated' : 'Response sent',
            'The person who posted this can compare your offer with others. You are not selected until they choose you.',
            [{ text: 'OK', onPress: () => router.back() }],
          );
        },
      },
    );
  };

  if (gateMode === 'checking') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Before you respond" onClose={() => router.back()} />
        <LoadingState label="Checking a few things" />
      </Screen>
    );
  }

  if (gateMode === 'open' && gateBlocker) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={headerTitle} onBack={headerBack} onClose={() => router.back()} />
        <RespondRequirementsGate
          blocker={gateBlocker}
          checking={false}
          onRecheck={() => void tryStartResponse()}
        />
      </Screen>
    );
  }

  if (inFlow && position) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ResponseCreationFlow
          key={flowKey}
          step={flowStep}
          onStepChange={setFlowStep}
          onExit={exitFlow}
          request={request}
          initialYourOffer={initialYourOffer}
          initialMessage={initialMessage}
          position={position}
          isUpdate={Boolean(existingResponse)}
          submitting={respond.isPending}
          submitError={respond.error}
          onSubmit={submitResponse}
        />
      </Screen>
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
            onSuccess: () => router.back(),
          }),
      },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <RequestFlowHeader title="Request" onBack={() => router.back()} />

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <RequestHelpSummary request={request} existingResponse={Boolean(existingResponse)} />

        {attendingElsewhere ? (
          <RequestCallout tone="warning" title="Attending another request">
            <Text className="text-sm text-muted">
              You can still respond to other requests. Nobody can select you while you are attending
              another one.
            </Text>
          </RequestCallout>
        ) : null}

        {isFetchingMatch ? <LoadingState label="Checking this request" /> : null}

        {existingResponse ? (
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

        {existingResponse ? (
          <Button
            label="Cancel response"
            variant="danger"
            size="lg"
            loading={withdrawResponse.isPending}
            onPress={confirmWithdraw}
          />
        ) : (
          <Button
            label="Respond to request"
            variant="active"
            size="lg"
            onPress={() => void tryStartResponse()}
          />
        )}

        {existingResponse ? (
          <Button
            label="Update response"
            variant="secondary"
            size="lg"
            onPress={() => void tryStartResponse()}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
