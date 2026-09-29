import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useRequestForResponse, useRespondToRequest } from '@/features/requests/responses-api';
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
  const profile = useProfile();
  const respond = useRespondToRequest();

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

  const headerTitle = inFlow
    ? flowStep === 0
      ? 'Your offer'
      : 'Your message'
    : gateMode === 'open'
      ? 'Before you respond'
      : 'Can you help?';

  if (!locationChecked || isPending || profile.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Can you help?" onClose={() => router.back()} />
        <LoadingState label="Opening this request" />
      </Screen>
    );
  }

  if (needsLocation) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Can you help?" onClose={() => router.back()} />
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
        <Header title="Can you help?" onClose={() => router.back()} />
        <ErrorState error={error ?? profile.error} onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!request || requesterOffer === null) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Can you help?" onClose={() => router.back()} />
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
            'The requester can compare your offer with others. You are not committed until they select you.',
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
        <Header title={headerTitle} onBack={headerBack} onClose={() => router.back()} />

        <ResponseCreationFlow
          key={flowKey}
          step={flowStep}
          setStep={setFlowStep}
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

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={headerTitle} onClose={() => router.back()} />

      <ScrollView contentContainerClassName="gap-8 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <Card>
          <RequestHelpSummary request={request} />
        </Card>

        {attendingElsewhere ? (
          <Card tone="warning">
            <Text className="text-base font-semibold text-ink">
              You&apos;re attending another request
            </Text>
            <Text className="text-sm text-muted">
              You can still send responses — that does not commit you. Other requesters cannot
              select you while you are attending a job elsewhere.
            </Text>
          </Card>
        ) : null}

        {isFetchingMatch ? <LoadingState label="Checking this request" /> : null}

        <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
          <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
          <Text className="flex-1 text-sm text-muted">
            They see your name, rating, and a rough sense of how close you are. Exact location and
            phone open only if they select you.
          </Text>
        </View>

        {existingResponse ? (
          <Text className="text-center text-sm text-muted">
            You already sent a response on this request. You can update your offer or message.
          </Text>
        ) : null}

        {respond.isError ? <InlineError error={respond.error} /> : null}

        <Button
          label={existingResponse ? 'Update response' : 'I can help'}
          size="lg"
          onPress={() => void tryStartResponse()}
        />
      </ScrollView>
    </Screen>
  );
}
